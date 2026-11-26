import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { extractBearerToken, resolveRequestSession } from "./lib/authUtils";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const session = resolveRequestSession(req);
  if (!session && !extractBearerToken(req) && !req.userId) {
    req.userId = "user_mock_lecturer";
  }
  next();
});

app.use("/api", router);

export default app;
