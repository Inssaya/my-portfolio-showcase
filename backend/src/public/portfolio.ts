import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../errors.js";

const router = Router();

/**
 * Everything a first-page visit needs, in one round trip.
 *
 * The frontend calls this once on mount and hands the result to the same
 * setters the localStorage layer used to feed. Fetching each collection
 * separately would inflate first paint by a factor equal to the number of
 * calls — cheap to consolidate here because the whole set is small.
 */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [projects, hero, social, about, education, experience, skills, certificates] =
      await Promise.all([
        prisma.project.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] }),
        prisma.hero.findUnique({ where: { id: 1 } }),
        prisma.socialLinks.findUnique({ where: { id: 1 } }),
        prisma.aboutCard.findMany({ orderBy: { position: "asc" } }),
        prisma.education.findMany({ orderBy: { position: "asc" } }),
        prisma.experience.findMany({ orderBy: { position: "asc" } }),
        prisma.skillCategory.findMany({ orderBy: { position: "asc" } }),
        prisma.certificate.findMany({ orderBy: { position: "asc" } }),
      ]);

    // Cache for a minute at the edge — the portfolio doesn't change every
    // request, and this endpoint runs on every visit.
    res.set("cache-control", "public, max-age=60, s-maxage=60");
    res.json({ projects, hero, social, about, education, experience, skills, certificates });
  }),
);

export default router;
