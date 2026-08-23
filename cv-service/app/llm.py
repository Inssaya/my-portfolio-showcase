"""OpenAI chat-completions client, scheduled over a pool of API keys.

The pool is the point (see `keypool.py`): OpenAI rate-limits per key, so a
single key caps concurrent CV sessions well before the service is under load.

The retry policy here is what makes the pool worth having. A 429 is treated as
"wrong key", not "failed request": the key is parked for as long as OpenAI asks,
another is drawn, and the visitor never sees it. Only running out of healthy
keys becomes an error, and it carries a retry hint so the UI can say something
truthful about when to try again.

Usage is returned alongside the message because token accounting is a product
requirement here, not telemetry — it is what the per-user quota is enforced on.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field

import httpx

from .config import get_settings
from .keypool import KeyPool, NoKeyAvailable

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 60

# Attempts per call, deliberately *not* tied to the pool size.
#
# It was `min(4, len(pool))`, which silently meant one attempt for a single-key
# deployment — so one dropped connection ("Server disconnected without sending
# a response", seen in a real run) failed the visitor's turn outright with no
# retry. Rate limits already stop early on their own: a cooling key makes the
# next `acquire` raise immediately, so these attempts are only ever spent on
# transient transport failures, which are exactly the case worth retrying.
MAX_ATTEMPTS = 4

# Brief pause before re-attempting after a dropped connection. Long enough for
# a blip to pass, short enough that the visitor does not notice.
TRANSPORT_BACKOFF_SECONDS = 0.75

# A cooldown shorter than this is waited out rather than reported.
#
# With several keys a cooling one is simply skipped. With one key there is
# nothing to skip to, so `acquire` failed immediately and a one-second backoff
# surfaced as "everyone's building CVs right now" — an alarming message for a
# wait the visitor would never have noticed. Anything longer than this is a real
# wait and is still reported honestly, with the time.
WAIT_OUT_SECONDS = 8.0


class LLMError(Exception):
    """Upstream refused or was unreachable."""


class LLMNotConfigured(LLMError):
    """No usable API key. The one failure a deployer must be told plainly."""


class LLMBusy(LLMError):
    """Every key is rate-limited. Carries seconds until one frees up."""

    def __init__(self, retry_after: float, detail: str) -> None:
        super().__init__(detail)
        self.retry_after = retry_after


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class Completion:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    # Which key served this, for logs and the ops view. Never the secret.
    key_label: str = ""
    # True when the response hit max_tokens mid-flight. The model had more to
    # say — with tool calls that means sections it never got to write, which is
    # invisible unless somebody checks for it.
    truncated: bool = False


_pool: KeyPool | None = None


def get_pool() -> KeyPool:
    """The process-wide key pool, built once from configuration."""
    global _pool
    if _pool is None:
        _pool = KeyPool(get_settings().api_key_list)
    return _pool


def reset_pool() -> None:
    """Rebuild the pool from current settings. For tests."""
    global _pool
    _pool = None


def _safe_arguments(raw: str) -> dict:
    """Models occasionally emit malformed argument JSON. An empty dict is safer
    than a 500 — the tool layer validates every field anyway."""
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _retry_after_seconds(response: httpx.Response) -> float | None:
    """OpenAI sends Retry-After on 429; honour it over any guess of ours."""
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse(data: dict, key_label: str) -> Completion:
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    usage = data.get("usage") or {}

    calls = [
        ToolCall(
            id=call.get("id", ""),
            name=(call.get("function") or {}).get("name", ""),
            arguments=_safe_arguments((call.get("function") or {}).get("arguments", "")),
        )
        for call in (message.get("tool_calls") or [])
    ]

    return Completion(
        content=message.get("content") or "",
        tool_calls=calls,
        prompt_tokens=int(usage.get("prompt_tokens") or 0),
        completion_tokens=int(usage.get("completion_tokens") or 0),
        key_label=key_label,
        truncated=choice.get("finish_reason") == "length",
    )


def read_image(prompt: str, image_png: bytes, sticky_key: str | None = None) -> Completion:
    """Transcribe an image through the vision endpoint.

    Reserved for CVs that yielded no usable text (see `cv/quality.py`). Vision
    input is billed by image tiles and costs multiples of a text turn, so it is
    the fallback for a small minority of uploads, never the default path.

    Same model as everything else — gpt-4o-mini reads a CV page perfectly well,
    and a second model would mean a second thing to configure and pay for.
    """
    import base64

    data_url = "data:image/png;base64," + base64.b64encode(image_png).decode("ascii")
    return complete(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    # "high" detail costs far more tiles; a CV page is legible
                    # at the default and the text is what matters, not the grain.
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        sticky_key=sticky_key,
    )


def complete(
    messages: list[dict],
    tools: list[dict] | None = None,
    sticky_key: str | None = None,
) -> Completion:
    """One completion, retried across keys on rate limits.

    `sticky_key` is the label that served this session last, so a session tends
    to stay on one key while the pool is idle — without ever overriding load
    balance (see KeyPool.acquire).
    """
    settings = get_settings()
    pool = get_pool()
    if not pool.configured:
        raise LLMNotConfigured("No OpenAI API keys are configured on the service.")

    payload: dict = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    url = f"{settings.openai_base_url.rstrip('/')}/chat/completions"
    last_error: Exception | None = None

    for attempt in range(MAX_ATTEMPTS):
        try:
            key = pool.acquire(sticky=sticky_key)
        except NoKeyAvailable as exc:
            # Distinguish "wait a moment" from "nothing here will ever work":
            # one is a busy signal, the other needs a human to fix a key.
            if exc.retry_after <= 0:
                raise LLMNotConfigured(str(exc)) from exc
            # A short cooldown is cheaper to sit through than to explain.
            if exc.retry_after <= WAIT_OUT_SECONDS and attempt < MAX_ATTEMPTS - 1:
                logger.info("all keys cooling for %.1fs, waiting", exc.retry_after)
                time.sleep(exc.retry_after + 0.25)
                continue
            raise LLMBusy(exc.retry_after, str(exc)) from exc

        try:
            response = httpx.post(
                url,
                json=payload,
                headers={"authorization": f"Bearer {key.secret}"},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            # A transport failure is not the key's fault, so it is not parked —
            # with a single-key pool the retry lands on the same key, which is
            # the point: the connection dropped, the key is fine.
            last_error = LLMError(f"Could not reach OpenAI: {type(exc).__name__}")
            logger.warning("openai transport error on %s: %s", key.label, exc)
            if attempt < MAX_ATTEMPTS - 1:
                time.sleep(TRANSPORT_BACKOFF_SECONDS)
            continue
        finally:
            pool.release(key)

        if response.status_code == 429:
            wait = _retry_after_seconds(response)
            pool.record_rate_limited(key, wait)
            logger.info(
                "openai rate-limited %s, cooling %ss", key.label, wait if wait else "backoff"
            )
            # Not an error yet — try the next key. This is the whole point.
            last_error = LLMBusy(wait or 0.0, "All keys are rate-limited.")
            continue

        if response.status_code in (401, 403):
            # Permanent: revoked, mistyped, or lacking access to the model. No
            # amount of waiting fixes it, so take the key out of rotation.
            reason = f"rejected by OpenAI ({response.status_code})"
            pool.disable(key, reason)
            logger.error("openai disabled %s — %s", key.label, reason)
            last_error = LLMError("An API key was rejected by OpenAI.")
            continue

        if response.status_code >= 300:
            # Never echo the provider's body to the client: it can carry the
            # organisation id and other account detail. Log it, return a code.
            logger.error(
                "openai %s returned %s: %s",
                key.label,
                response.status_code,
                response.text[:300],
            )
            raise LLMError(f"OpenAI returned {response.status_code}")

        pool.record_success(key)
        return _parse(response.json(), key.label)

    if isinstance(last_error, LLMBusy):
        health = pool.health()
        raise LLMBusy(
            last_error.retry_after or 5.0,
            f"All {health['total']} API keys are rate-limited right now.",
        )
    raise last_error or LLMError("OpenAI could not be reached.")
