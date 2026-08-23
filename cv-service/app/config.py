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

    # A small model is the point of the tool-heavy design: the draft lives
    # server-side, so the model never has to hold or restate the whole CV.
    llm_model: str = "gpt-4o-mini"
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

    # --- auth ------------------------------------------------------------------
    # The same project the portfolio's admin panel already uses
    # (src/lib/supabase.ts) — this service only ever calls the public
    # /auth/v1/user endpoint with the anon key, never the service_role key, so
    # the anon key is all it needs. See app/auth.py for why verification goes
    # through Supabase rather than a locally-checked JWT secret.
    supabase_url: str = ""
    supabase_anon_key: str = ""

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
