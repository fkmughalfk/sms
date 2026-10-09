import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@sms/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the same HTTP pipeline. */
export function configureApp(app: INestApplication, webUrl: string): void {
  const express = app as NestExpressApplication;
  // Behind Vercel / the Next.js rewrite: take the client IP from X-Forwarded-For.
  express.set('trust proxy', true);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: webUrl, credentials: true });
}
