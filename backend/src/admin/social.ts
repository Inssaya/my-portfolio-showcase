import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../errors.js";

const router = Router();

const socialSchema = z.object({
  github: z.string().max(500),
  linkedin: z.string().max(500),
  email: z.string().email().max(200),
  phone: z.string().max(60),
  location: z.string().max(200),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const social = await prisma.socialLinks.findUnique({ where: { id: 1 } });
    res.json({ social });
  }),
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = socialSchema.parse(req.body);
    const social = await prisma.socialLinks.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    res.json({ social });
  }),
);

export default router;
