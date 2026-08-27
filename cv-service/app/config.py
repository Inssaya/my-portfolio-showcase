"""Settings, read once from the environment."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# How many OPENAI_API_KEY_n slots to look for. Ten is the current pool size;
# raising it costs nothing because empty slots are ignored.
MAX_NUMBERED_KEYS = 20


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- OpenAI --------------------------------------------------------------
    # Keys come from either shape, and both may be used together:
    #
    #   OPENAI_API_KEYS=sk-a,sk-b,sk-c      one variable, quick to paste
    #   OPENAI_API_KEY_1=sk-a               one variable per key
    #   OPENAI_API_KEY_2=sk-b
    #
    # The numbered form exists because rotating one key out of ten should not
    # mean re-pasting a 600-character line into a hosting dashboard and hoping
    # no comma was lost. `OPENAI_API_KEY` (singular) also works, for one key.
    openai_api_key: str = ""
    openai_api_keys: str = ""
    openai_base_url: str = "https://api.openai.com/v1"

    # The tool-heavy design means the model never holds or restates the whole
    # CV — the draft lives server-side — so a small model *can* do the job, and
    # `gpt-4o-mini` was the default on that basis.
    #
    # What a small model cannot do is judge. Given an unedited template it
    # dutifully saved "123 Anywhere St., Any City", "hello@reallygreatsite.com"
    # and four Lorem Ipsum job descriptions as though they were the visitor's,
    # where a frontier model reads the same page and says "those are
    # placeholders, give me the real ones". The deterministic guards in
    # `cv/verify.py` exist because of that gap and catch the placeholders we
    # can enumerate; they cannot catch the ones we have never seen.
    #
    # So the default is the larger model. The architecture still pays for
    # itself — it is what keeps a full CV out of every request either way —
    # it is simply no longer carrying a weak model on its own. Set LLM_MODEL
    # to override; `gpt-4o-mini` remains a working choice if cost matters more
    # than judgement on a given deployment.
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.3

    # Output cap per response. This is a ceiling, not a charge — you pay for
    # tokens generated, so a generous one costs nothing on a short reply.
    #
    # 700 was silently costing whole sections. Saving a full CV means emitting
    # every section's text as tool-call arguments, and a real CV ran out at
    # exactly 700 with `finish_reason: length` after seven calls — projects,
    # certifications and interests were simply never written.
    llm_max_tokens: int = 2_000

    # --- agent ---------------------------------------------------------------
    # Enough rounds for extract -> patch -> patch -> render without letting a
    # confused model loop forever on our budget.
    max_tool_rounds: int = 8

    # --- limits --------------------------------------------------------------
    max_upload_bytes: int = 5 * 1024 * 1024

    # Master switch for app/ratelimit.py. Defaults on; exists as an escape
    # hatch to flip off via one env var without a redeploy if the limiter
    # itself ever misbehaves (a false-positive block during an incident is a
    # worse outage than briefly having no rate limiting at all).
    rate_limit_enabled: bool = True

    # Ceiling on one session's total tokens. Not a per-minute limit — there is
    # none in this service; a "too many requests" message can only ever be
    # OpenAI's own, relayed.
    #
    # 60k, from measurement rather than taste. One finished CV costs ~12.7k via
    # upload and ~34.7k via a full interview, so a 30k cap would cut a real
    # interview off partway — the worst possible moment, with the draft written
    # and no PDF. 60k leaves room to finish and then revise a few times.
    #
    # Set MAX_SESSION_TOKENS=0 to disable the ceiling entirely.
    max_session_tokens: int = 60_000

    # A signed-up visitor is a known person who came back; an anonymous one is
    # a free identity a script can mint per request. Both get enough budget to
    # build a real CV end to end — that is the whole point of letting somebody
    # in before they sign up — but the anonymous ceiling is lower, because it
    # is the one an abuser gets to spend over and over.
    #
    # Reaching it is not a dead end: the draft survives, the Build button still
    # renders it without the model (app/tools.py), and signing up lifts the
    # ceiling on the same account (Supabase keeps the user id when an anonymous
    # account is converted), so nothing built so far is lost.
    max_anonymous_session_tokens: int = 25_000

    # --- auth ------------------------------------------------------------------
    # The same project the portfolio's admin panel already uses
    # (src/lib/supabase.ts) — this service only ever calls the public
    # /auth/v1/user endpoint with the anon key, never the service_role key, so
    # the anon key is all it needs. See app/auth.py for why verification goes
    # through Supabase rather than a locally-checked JWT secret.
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # --- upload routing ------------------------------------------------------
    # An uploaded image is either the visitor's CV (photographed, scanned or
    # screenshotted) or a portrait to print on it, and only looking at the
    # pixels can tell them apart. By default every image goes to vision, which
    # reads it and decides.
    #
    # Setting this True instead runs a local ink/whitespace heuristic first and
    # only pays for vision when that says "page of text". It is a pure cost
    # lever and it is OFF because it is measurably wrong on real CVs: a
    # dark-theme template, a coloured-sidebar design — including this service's
    # own `modern` style — reads as "not a document" and would be filed as the
    # visitor's headshot, losing their CV entirely. Turn it on only if vision
    # spend actually becomes a problem, and accept that failure with it.
    cheap_image_routing: bool = False

    # The single admin account, matched by email against the caller's verified
    # JWT for the /admin/* routes. Kept in sync with the portfolio's
    # src/lib/adminRole.ts and the is_admin() SQL function. Override per
    # deployment with ADMIN_EMAIL if the owner ever changes.
    admin_email: str = "yassinsinif4@gmail.com"

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_anon_key)

    # --- CORS ----------------------------------------------------------------
    allowed_origins: str = "http://localhost:8080,http://127.0.0.1:8080"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def api_key_list(self) -> list[str]:
        """Every configured key, in a stable order, de-duplicated by the pool.

        Read from the environment directly for the numbered slots: declaring
        twenty optional fields on the model to express one list would be worse
        than this, and pydantic-settings has no idiom for a numbered family.
        """
        keys: list[str] = []
        if self.openai_api_key.strip():
            keys.append(self.openai_api_key.strip())
        keys.extend(k.strip() for k in self.openai_api_keys.split(",") if k.strip())
        for index in range(1, MAX_NUMBERED_KEYS + 1):
            value = os.environ.get(f"OPENAI_API_KEY_{index}", "").strip()
            if value:
                keys.append(value)
        return keys

    @property
    def llm_configured(self) -> bool:
        return bool(self.api_key_list)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings() -> None:
    """Drop the cached settings so a test can change the environment."""
    get_settings.cache_clear()
