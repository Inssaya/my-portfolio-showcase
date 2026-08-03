import { Router } from "express";
import portfolio from "./portfolio.js";
import contact from "./contact.js";

const router = Router();

router.use("/portfolio", portfolio);
router.use("/messages", contact);

export default router;
