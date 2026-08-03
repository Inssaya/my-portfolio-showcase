import jwt from "jsonwebtoken";
import { env } from "../env.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

/** Issue a signed access token. Callers pass the user record; nothing sensitive
 *  goes into the payload — the hash never leaves the database. */
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/** Verify a token and return its payload. Throws jwt.JsonWebTokenError on
 *  any signature/expiry/malformation failure — callers map that to 401. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
  // jsonwebtoken types the return as `string | JwtPayload`; string only
  // happens if the token was signed with a raw string payload, which we
  // never do — so a type guard keeps the compiler honest.
  if (typeof decoded === "string") throw new Error("Unexpected string payload");
  return {
    sub: String(decoded.sub),
    email: String(decoded.email),
    role: String(decoded.role),
  };
}

export const tokenTtlSeconds = TOKEN_TTL_SECONDS;
