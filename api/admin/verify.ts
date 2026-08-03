import { jwtVerify } from "jose";

export const config = { runtime: "edge" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const secret = process.env.JWT_SECRET;
  if (!secret) return json({ error: "not_configured" }, 503);

  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return json({ error: "missing_token" }, 401);

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(match[1], key, { algorithms: ["HS256"] });
    return json({ ok: true, sub: payload.sub, exp: payload.exp });
  } catch {
    // Expired, wrong signature, malformed — all read the same to the client.
    return json({ error: "invalid_token" }, 401);
  }
}
