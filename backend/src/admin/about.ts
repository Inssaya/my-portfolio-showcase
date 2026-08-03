import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const ICONS = ["Briefcase", "Globe", "Award"] as const;

const cardSchema = z.object({
  icon: z.enum(ICONS),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(2000),
  position: z.number().int().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const cards = await prisma.aboutCard.findMany({ orderBy: { position: "asc" } });
    res.json({ cards });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = cardSchema.parse(req.body);
    const card = await prisma.aboutCard.create({ data });
    res.status(201).json({ card });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = cardSchema.partial().parse(req.body);
    const card = await prisma.aboutCard.update({ where: { id }, data });
    res.json({ card });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.aboutCard.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
