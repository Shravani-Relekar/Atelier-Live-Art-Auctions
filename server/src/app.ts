import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { clientOrigins, cloudinaryEnabled, env } from "./config/env";
import { optionalAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { auctionRules } from "./lib/serializers";
import { prisma } from "./lib/prisma";
import authRoutes from "./routes/auth";
import auctionRoutes from "./routes/auctions";
import lotRoutes from "./routes/lots";
import artistRoutes from "./routes/artists";
import meRoutes from "./routes/me";
import adminRoutes from "./routes/admin";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: clientOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(optionalAuth);

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: Date.now() });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      cloudinary: { enabled: cloudinaryEnabled, cloudName: env.CLOUDINARY_CLOUD_NAME || null },
      rules: auctionRules(),
      serverTime: Date.now(),
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/auctions", auctionRoutes);
  app.use("/api/lots", lotRoutes);
  app.use("/api/artists", artistRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
