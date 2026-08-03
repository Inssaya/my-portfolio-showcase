import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../errors.js";

const router = Router();

/** Aggressive on this one: it's the only writable public endpoint and gets
 *  scraped by any bot that finds it. Real visitors don't send 6 messages in
 *  an hour; anyone who does either has a stuck submit button or bad intent. */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_messages" },
});

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  /** Honeypot. Real browsers never fill it; bots that see a "website" input
   *  in the form fill it out of habit. We accept the request and 200 back so
   *  the bot thinks it succeeded, but drop the payload silently. */
  website: z.string().max(0).optional(),
});

router.post(
  "/",
  contactLimiter,
  asyncHandler(async (req, res) => {
    const data = contactSchema.parse(req.body);

    // Honeypot: field populated → skip the write and pretend success.
    if (data.website) return res.status(202).json({ ok: true });

    await prisma.message.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        subject: data.subject,
        message: data.message,
      },
    });

    res.status(201).json({ ok: true });
  }),
);

export default router;
