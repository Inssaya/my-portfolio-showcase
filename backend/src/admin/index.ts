import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import projects from "./projects.js";
import hero from "./hero.js";
import social from "./social.js";
import about from "./about.js";
import education from "./education.js";
import experience from "./experience.js";
import skills from "./skills.js";
import certificates from "./certificates.js";
import messages from "./messages.js";

const router = Router();

// Every route under /api/admin/* requires a valid admin JWT — enforced once
// here rather than repeated inside each sub-router, so it's impossible to
// add a new admin route and forget the guard.
router.use(requireAuth, requireRole("admin"));

router.use("/projects", projects);
router.use("/hero", hero);
router.use("/social", social);
router.use("/about", about);
router.use("/education", education);
router.use("/experience", experience);
router.use("/skills", skills);
router.use("/certificates", certificates);
router.use("/messages", messages);

export default router;
