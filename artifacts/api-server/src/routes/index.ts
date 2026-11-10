import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import waitlistRouter from "./waitlist.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/waitlist", waitlistRouter);

export default router;
