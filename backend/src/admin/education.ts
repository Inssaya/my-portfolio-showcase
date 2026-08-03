import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const educationSchema = z.object({
  period: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  institution: z.string().min(1).max(200),
  description: z.string().max(1000),
  position: z.number().int().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.education.findMany({ orderBy: { position: "asc" } });
    res.json({ items });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = educationSchema.parse(req.body);
    const item = await prisma.education.create({ data });
    res.status(201).json({ item });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = educationSchema.partial().parse(req.body);
    const item = await prisma.education.update({ where: { id }, data });
    res.json({ item });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.education.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
