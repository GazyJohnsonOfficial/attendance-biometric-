import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import adminReferenceRouter from "./adminReference";
import authRouter from "./auth";
import classesRouter from "./classes";
import overviewRouter from "./overview";
import sessionsRouter from "./sessions";
import studentRouter from "./student";

const router: IRouter = Router();

router.use(authRouter);
router.use(adminReferenceRouter);
router.use(adminRouter);
router.use(classesRouter);
router.use(sessionsRouter);
router.use(overviewRouter);
router.use(studentRouter);

export default router;
