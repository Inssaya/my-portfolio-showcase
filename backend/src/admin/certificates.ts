import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const certificateSchema = z.object({
  name: z.string().min(1).max(300),
  issuer: z.string().min(1).max(200),
  position: z.number().int().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.certificate.findMany({ orderBy: { position: "asc" } });
    res.json({ items });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = certificateSchema.parse(req.body);
    const item = await prisma.certificate.create({ data });
    res.status(201).json({ item });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = certificateSchema.partial().parse(req.body);
    const item = await prisma.certificate.update({ where: { id }, data });
    res.json({ item });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.certificate.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
