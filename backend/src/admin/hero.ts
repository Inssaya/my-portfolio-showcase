import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../errors.js";

const router = Router();

const heroSchema = z.object({
  subtitle: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  titleHighlight: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const hero = await prisma.hero.findUnique({ where: { id: 1 } });
    res.json({ hero });
  }),
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = heroSchema.parse(req.body);
    // Upsert on the fixed row id so the caller doesn't have to know whether
    // this is the first save or a subsequent edit.
    const hero = await prisma.hero.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    res.json({ hero });
  }),
);

export default router;
