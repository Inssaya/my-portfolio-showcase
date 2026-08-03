import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const skillCategorySchema = z.object({
  title: z.string().min(1).max(120),
  skills: z.array(z.string().min(1).max(60)).max(60),
  position: z.number().int().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.skillCategory.findMany({ orderBy: { position: "asc" } });
    res.json({ categories });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = skillCategorySchema.parse(req.body);
    const category = await prisma.skillCategory.create({ data });
    res.status(201).json({ category });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = skillCategorySchema.partial().parse(req.body);
    const category = await prisma.skillCategory.update({ where: { id }, data });
    res.json({ category });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.skillCategory.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
