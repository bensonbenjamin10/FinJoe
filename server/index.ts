import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import morgan from "morgan";
import { requestId } from "./middleware.js";
import { logger } from "./logger.js";
import { registerRoutes } from "./routes.js";
import { setupAuth } from "./auth.js";
import { setupVite, serveStatic } from "./vite.js";

const app = express();
app.set("trust proxy", 1);

app.use(requestId);
app.use(
  morgan((tokens, req: Request, res) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const entry = {
      timestamp: new Date().toISOString(),
      level: "info",
      service: "finjoe-api",
      message: "HTTP request",
      requestId,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: tokens.status(req, res),
      responseTime: tokens["response-time"](req, res),
      ip: tokens["remote-addr"](req, res),
    };
    return JSON.stringify(entry);
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

setupAuth(app);
const server = await registerRoutes(app);

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  logger.error("Request error", {
    requestId,
    message: err.message,
    status: err.status || 500,
    stack: err.stack,
  });
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

const port = parseInt(process.env.PORT || "5000", 10);
server.listen(port, "0.0.0.0", () => {
  logger.info("FinJoe serving", { port });
});
