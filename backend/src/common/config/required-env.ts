/** Variables the API cannot run without. There are no fallbacks for them. */
export const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

/**
 * `ConfigModule.forRoot({ validate })` hook: fails startup with one error that
 * names every missing variable, instead of booting with a guessable default.
 */
export function validateRequiredEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ENV.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Set them in backend/.env (see .env.example) or the process environment.',
    );
  }
  if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_REFRESH_SECRET must differ from JWT_SECRET, otherwise an access token is accepted as a refresh token.',
    );
  }
  return config;
}
