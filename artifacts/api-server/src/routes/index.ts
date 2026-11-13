import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import waitlistRouter from "./waitlist.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/waitlist", waitlistRouter);
router.use("/admin", adminRouter);

export default router;
