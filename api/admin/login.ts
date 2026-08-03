import { SignJWT } from "jose";

export const config = { runtime: "edge" };

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Length-independent equality on two ASCII strings — protects against timing
 * attacks the same way `crypto.timingSafeEqual` does, but works on the edge
 * runtime without pulling in Node's `crypto` module. Runs in time proportional
 * to `max(a.length, b.length)` and doesn't short-circuit on the first mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  const secret = process.env.JWT_SECRET;

  if (!expectedUser || !expectedPass || !secret) {
    // Explicit rather than a generic 500 — this is the one failure a deployer
    // will hit if they forget the env vars.
    return json({ error: "not_configured" }, 503);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return json({ error: "missing_credentials" }, 400);
  }

  // Both comparisons run to completion regardless of the first outcome, so
  // a wrong username can't be distinguished from a wrong password by timing.
  const userOk = safeEqual(username, expectedUser);
  const passOk = safeEqual(password, expectedPass);
  if (!userOk || !passOk) {
    return json({ error: "invalid_credentials" }, 401);
  }

  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(username)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);

  return json({ token, expiresIn: TOKEN_TTL_SECONDS });
}
