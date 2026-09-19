/**
 * Error tracking - Sentry initialization
 *
 * Only initializes when VITE_SENTRY_DSN is set, so local/dev usage without a
 * Sentry project configured stays a silent no-op instead of failing or
 * spamming Sentry's free-tier quota with dev noise.
 */

import * as Sentry from '@sentry/react';
import { env } from '../config';

export function initSentry(): void {
  if (!env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.MODE,
    // Conservative default: capture all errors, but only a slice of
    // performance traces so the free tier's event quota lasts. Tune this
    // (e.g. lower in production) once real traffic volume is known.
    tracesSampleRate: env.PROD ? 0.2 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
