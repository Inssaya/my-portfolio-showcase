import { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../errors.js";
import { TokenPayload, verifyToken } from "./jwt.js";

/** The authenticated principal, attached to `req.user` inside guarded routes. */
export interface AuthenticatedRequest extends Request {
  user: TokenPayload;
}

/**
 * Authenticates the caller from an Authorization: Bearer header. On success
 * attaches the decoded payload to `req.user`; on any failure — missing header,
 * malformed token, expired signature — throws 401.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1];
  if (!token) throw unauthorized("missing_token");

  try {
    (req as AuthenticatedRequest).user = verifyToken(token);
    next();
  } catch {
    // Everything past the bearer check reads the same to the client — we don't
    // reveal whether a token expired vs was forged vs was malformed.
    throw unauthorized("invalid_token");
  }
}

/**
 * Layered on top of requireAuth. Trusts req.user is populated (attach requireAuth
 * upstream in the chain) and rejects anyone whose role isn't in the allow-list.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) throw forbidden("role_denied");
    next();
  };
}
