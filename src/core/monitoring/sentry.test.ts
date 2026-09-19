import { describe, it, expect, vi, afterEach } from 'vitest';

// @sentry/react is mocked so this test never touches the real SDK or network.
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({})),
}));

describe('initSentry', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not call Sentry.init when VITE_SENTRY_DSN is empty', async () => {
    vi.doMock('../config', () => ({ env: { VITE_SENTRY_DSN: '', MODE: 'test', PROD: false } }));

    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('./sentry');

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the configured DSN when it is set', async () => {
    vi.doMock('../config', () => ({
      env: { VITE_SENTRY_DSN: 'https://fake@sentry.example/1', MODE: 'production', PROD: true },
    }));

    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('./sentry');

    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const config = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(config.dsn).toBe('https://fake@sentry.example/1');
    expect(config.environment).toBe('production');
    expect(config.tracesSampleRate).toBe(0.2);
  });
});
