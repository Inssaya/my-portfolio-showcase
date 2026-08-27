import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  guestName,
  guestNameFromId,
  guestSignInMessage,
  isGuest,
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
   * These map Supabase's own error text onto something actionable. The whole
   * reason they exist: the generic "Something went wrong. Please try again."
   * was shown for a disabled project setting, which points at nothing and
   * cost a round trip to diagnose.
   */
  it("names the setting when anonymous sign-in is disabled", () => {
    const message = guestSignInMessage("Anonymous sign-ins are disabled");

    expect(message).toContain("Anonymous");
    expect(message.toLowerCase()).toContain("supabase");
  });

  it("recognises a CAPTCHA requirement", () => {
    expect(guestSignInMessage("captcha protection: request disallowed"))
      .toContain("CAPTCHA");
  });

  it("keeps the raw reason for anything it does not recognise", () => {
    // A message nobody can act on is exactly the failure being fixed here, so
    // an unknown error must carry its own text rather than be swallowed.
    expect(guestSignInMessage("teapot refused to brew")).toContain(
      "teapot refused to brew",
    );
  });
});

describe("guestSignInMessage with a real AuthError shape", () => {
  it("uses the machine-readable code, not just the prose", () => {
    // Supabase rewords its messages between releases; `code` is the stable
    // half, so recognising the cause must not depend on the wording.
    const message = guestSignInMessage({
      message: "Signups not allowed for this instance",
      code: "anonymous_provider_disabled",
      status: 422,
    });

    expect(message).toContain("Anonymous");
  });

  it("puts the code and status on screen for anything unrecognised", () => {
    // Read on a phone, where there is no console to open — the message has to
    // be the whole diagnostic or it is another dead end.
    const message = guestSignInMessage({
      message: "unexpected failure",
      code: "some_new_code",
      status: 500,
    });

    expect(message).toContain("some_new_code");
    expect(message).toContain("500");
  });
});
