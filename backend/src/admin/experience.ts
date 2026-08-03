import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const experienceSchema = z.object({
  period: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200),
  bullets: z.array(z.string().min(1).max(1000)).max(20),
  position: z.number().int().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.experience.findMany({ orderBy: { position: "asc" } });
    res.json({ items });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = experienceSchema.parse(req.body);
    const item = await prisma.experience.create({ data });
    res.status(201).json({ item });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = experienceSchema.partial().parse(req.body);
    const item = await prisma.experience.update({ where: { id }, data });
    res.json({ item });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.experience.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
