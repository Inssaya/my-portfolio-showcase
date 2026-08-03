/**
 * Admin auth — client side.
 *
 * The token itself is issued by /api/admin/login (HS256, 7-day TTL) and
 * verified by /api/admin/verify. We only ever read `exp` locally to skip a
 * network call on obviously-expired tokens; the real trust boundary is the
 * server verify, because the signing secret only lives there.
 */

const TOKEN_KEY = "admin_jwt";

export interface AuthStatus {
  /** Signed JWT (HS256), or null if not logged in / expired. */
  token: string | null;
  /** Server has confirmed the token, or we haven't asked yet. */
  verified: boolean;
}

export function getToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    // Strip out obviously-dead tokens before any code path reaches for them.
    if (isExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage unavailable — fall through, the caller will see no session.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do.
  }
}

/** POST /api/admin/login. Throws on failure; returns the token on success. */
export async function login(username: string, password: string): Promise<string> {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new LoginError(err?.error ?? "request_failed", response.status);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new LoginError("malformed_response", 500);

  setToken(data.token);
  return data.token;
}

/** Hits /api/admin/verify to confirm the current token is still valid. */
export async function verify(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/verify", {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export class LoginError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = "LoginError";
  }
}

/**
 * Decodes the token's exp claim without verifying the signature — that check
 * is authoritative only on the server; here it's a cheap gate to avoid a
 * verify round-trip on a token we already know is dead.
 */
function isExpired(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return true;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
