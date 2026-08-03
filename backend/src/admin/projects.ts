import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler, badRequest } from "../errors.js";

const router = Router();

const STATUSES = ["En cours", "Terminé"] as const;
const CATEGORIES = ["Personnel", "Académique", "Internship"] as const;

const projectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  longDescription: z.string().max(20_000).optional().nullable(),
  tech: z.array(z.string().min(1).max(60)).max(30),
  status: z.enum(STATUSES),
  category: z.enum(CATEGORIES),
  image: z.string().url().optional().nullable(),
  demoUrl: z.string().url().optional().nullable(),
  githubUrl: z.string().url().optional().nullable(),
  position: z.number().int().optional(),
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const projects = await prisma.project.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });
    res.json({ projects });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = projectSchema.parse(req.body);
    const baseSlug = slugify(data.title);
    if (!baseSlug) throw badRequest("invalid_title");
    // Uniqueness collisions are handled by the P2002 → 409 branch in the
    // error handler; retrying with a numeric suffix here would hide it.
    const project = await prisma.project.create({
      data: { ...data, slug: baseSlug },
    });
    res.status(201).json({ project });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    const data = projectSchema.partial().parse(req.body);
    const patch: typeof data & { slug?: string } = { ...data };
    // Re-derive slug from a new title so admin edits keep the URL consistent
    // with what the visitor sees on the card.
    if (data.title) patch.slug = slugify(data.title);
    const project = await prisma.project.update({ where: { id }, data: patch });
    res.json({ project });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) throw badRequest();
    await prisma.project.delete({ where: { id } });
    res.status(204).end();
  }),
);

export default router;
