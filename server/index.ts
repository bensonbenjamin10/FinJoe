import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupAuth } from "./auth.js";
import { setupVite, serveStatic } from "./vite.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

setupAuth(app);
const server = await registerRoutes(app);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  serveStatic(app);
}

const port = parseInt(process.env.PORT || "5000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`FinJoe serving on port ${port}`);
});
