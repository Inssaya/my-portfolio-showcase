import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  guestName,
  guestNameFromId,
  guestSignInMessage,
  isGuest,
  wantsDiagnostics,
} from "@/lib/cv/guest";

/**
 * Guests are the majority of visitors now — everyone who starts a CV without
 * signing up. Two things about them are load-bearing enough to pin:
 *
 *   * `isGuest` decides whether the sign-in and sign-up pages bounce someone
 *     who already holds a session. Getting it wrong strands a returning member
 *     on a page they cannot get past, or sends a guest away from the very page
 *     they came to for an account.
 *   * `guestName` is shown to the visitor *and*, from the id alone, to the
 *     admin. If it were not stable, the two would disagree and it would
 *     change under the visitor between renders.
 */

const user = (over: Partial<User>): User => ({ id: "u", ...over }) as User;

describe("isGuest", () => {
  it("is false with no session at all — that is signed out, not a guest", () => {
    expect(isGuest(null)).toBe(false);
    expect(isGuest(undefined)).toBe(false);
  });

  it("recognises an anonymous account", () => {
    expect(isGuest(user({ is_anonymous: true }))).toBe(true);
  });

  it("does not treat a signed-up account as a guest", () => {
    expect(isGuest(user({ is_anonymous: false, email: "a@b.com" }))).toBe(false);
  });

  it("falls back to the missing email when is_anonymous is absent", () => {
    // Older Supabase projects predate the flag; the CV builder has no
    // provider that yields an account without an email, so this is safe.
    expect(isGuest(user({ email: undefined }))).toBe(true);
    expect(isGuest(user({ email: "a@b.com" }))).toBe(false);
  });

  it("stops being true the moment an account is converted", () => {
    // updateUser() keeps the id and clears is_anonymous — the visitor keeps
    // every CV they built, and the save prompt has to stop asking.
    const before = user({ id: "same", is_anonymous: true });
    const after = user({ id: "same", is_anonymous: false, email: "a@b.com" });

    expect(isGuest(before)).toBe(true);
    expect(isGuest(after)).toBe(false);
  });
});

describe("guestName", () => {
  it("is stable for the same account", () => {
    const name = guestName(user({ id: "abc-123" }));

    expect(guestName(user({ id: "abc-123" }))).toBe(name);
  });

  it("agrees with the name derived from the bare id, which is what the admin sees", () => {
    expect(guestName(user({ id: "abc-123" }))).toBe(guestNameFromId("abc-123"));
  });

  it("reads as a name, not an id", () => {
    expect(guestNameFromId("abc-123")).toMatch(/^Guest \d{3}$/);
  });

  it("does not leak the account id", () => {
    expect(guestNameFromId("11112222-3333-4444-5555-666677778888")).not.toContain("1111");
  });
});

describe("guestSignInMessage", () => {
  /**
   * The rule this file exists to hold: whatever went wrong, a visitor is
   * never told to go and change a setting on somebody else's dashboard.
   */
  const OWNER_WORDS = ["supabase", "provider", "dashboard", "captcha", "setting"];

  const cases = [
    { message: "Anonymous sign-ins are disabled", code: "anonymous_provider_disabled" },
    { message: "captcha protection: request disallowed", code: "captcha_failed" },
    { message: "Request rate limit reached", status: 429 },
    { message: "Failed to fetch" },
    { message: "teapot refused to brew", code: "unknown", status: 418 },
  ];

  it.each(cases)("says nothing about configuration for %o", (error) => {
    const message = guestSignInMessage(error).toLowerCase();

    for (const word of OWNER_WORDS) {
      expect(message).not.toContain(word);
    }
  });

  it("offers the visitor the thing they can actually do", () => {
    expect(guestSignInMessage({ message: "Anonymous sign-ins are disabled" }))
      .toContain("account");
  });

  it("reports a rate limit as temporary even though it mentions anonymous", () => {
    // The bug this pins: Supabase's rate-limit message contains the word
    // "anonymous", so matching that first reported a block that clears on its
    // own as a permanent misconfiguration — sending the owner to a setting
    // that was already correct.
    const message = guestSignInMessage({
      message: "Anonymous sign-ins are rate limited",
      status: 429,
    });

    expect(message.toLowerCase()).toContain("wait");
  });

  it("keeps the diagnostic out of the message by default", () => {
    expect(guestSignInMessage({ message: "teapot", code: "brew_failed" }))
      .not.toContain("brew_failed");
  });

  it("includes it when the owner asks for it explicitly", () => {
    // ?debug=1 — the escape hatch for diagnosing this from a phone, where
    // there is no console to open.
    const message = guestSignInMessage(
      { message: "teapot", code: "brew_failed", status: 418 },
      { verbose: true },
    );

    expect(message).toContain("brew_failed");
    expect(message).toContain("418");
  });
});

describe("wantsDiagnostics", () => {
  it("is off unless asked for", () => {
    expect(wantsDiagnostics("")).toBe(false);
    expect(wantsDiagnostics("?from=/cv-builder")).toBe(false);
  });

  it("is on for ?debug=1", () => {
    expect(wantsDiagnostics("?debug=1")).toBe(true);
  });
});
