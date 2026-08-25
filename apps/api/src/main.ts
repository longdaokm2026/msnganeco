import "dotenv/config";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { validateEnvironment } from "./config/env";

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, { cors: false });
  const port = Number(process.env.API_PORT ?? 4000);
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  // Production traffic reaches Express through exactly one trusted Caddy hop.
  // This lets express-rate-limit use Caddy's X-Forwarded-For value safely.
  app.getHttpAdapter().getInstance().set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

  app.use(helmet());
  app.use(cookieParser());
  app.use(
    ["/auth/register", "/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password"],
    rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.enableCors({ origin: webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");
  console.log(`Authentication API listening on http://localhost:${port}`);
}

void bootstrap();
