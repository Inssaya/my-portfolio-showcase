import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, unauthorized } from "../errors.js";
import { AuthenticatedRequest, requireAuth } from "./middleware.js";
import { signToken, tokenTtlSeconds } from "./jwt.js";

const router = Router();

/** Login is the one publicly-callable endpoint most worth rate-limiting —
 *  10 attempts per 15 min per IP is generous for a real user, harsh on a
 *  brute-force script. Everything else on the API is behind auth. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_attempts" },
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Compare against a real hash even when the user doesn't exist, so wrong
    // email and wrong password take the same time — no user enumeration via
    // response timing. The dummy hash below is a bcrypt of the empty string.
    const dummyHash = "$2a$10$abcdefghijklmnopqrstuu0000000000000000000000000000000000";
    const hashToCheck = user?.passwordHash ?? dummyHash;
    const ok = await bcrypt.compare(password, hashToCheck);

    if (!user || !ok) throw unauthorized("invalid_credentials");

    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({
      token,
      expiresIn: tokenTtlSeconds,
      user: { id: user.id, email: user.email, role: user.role },
    });
  }),
);

/** Returns the currently-authenticated user. Used by the frontend to hydrate
 *  a session on page load and to confirm the token is still valid. */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthenticatedRequest;
    const record = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
    if (!record) throw unauthorized("stale_token");
    res.json({ user: record });
  }),
);

/** Password change — only for the caller themselves. The current password is
 *  verified in the same request so a stolen token alone can't pivot to a
 *  password reset. */
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

router.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user } = req as AuthenticatedRequest;
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);

    const record = await prisma.user.findUnique({ where: { id: user.sub } });
    if (!record) throw unauthorized("stale_token");

    const ok = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!ok) throw unauthorized("invalid_credentials");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: record.id }, data: { passwordHash } });
    res.json({ ok: true });
  }),
);

export default router;
