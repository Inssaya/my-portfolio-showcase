import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const messages = await prisma.message.findMany({ orderBy: { createdAt: "desc" } });
    const unread = await prisma.message.count({ where: { read: false } });
    res.json({ messages, unread });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    // Only the read flag is admin-editable — the caller's name, email, subject
    // and body are audit history and must not mutate.
    const patchSchema = z.object({ read: z.boolean() });
    const patch = patchSchema.parse(req.body);
    const message = await prisma.message.update({ where: { id }, data: patch });
    res.json({ message });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.message.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
