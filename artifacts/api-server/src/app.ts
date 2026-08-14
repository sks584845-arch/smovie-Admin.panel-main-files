import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { mediaRoot } from "./lib/media-storage";

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
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Media bytes live on this server's filesystem. Express' static handler keeps
// poster access simple; the API router provides explicit range streaming for
// videos and images at /api/uploads/:kind/:filename.
app.use("/uploads", express.static(mediaRoot, {
  acceptRanges: true,
  fallthrough: false,
  index: false,
}));

app.use("/api", router);

export default app;
