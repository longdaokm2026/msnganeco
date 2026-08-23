const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

export const authConfig = {
  accessSecret: () => {
    const value = process.env.JWT_ACCESS_SECRET;
    if (!value || value.length < 32) {
      throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters.");
    }
    return value;
  },
  accessTtlSeconds: () => integer("ACCESS_TOKEN_TTL_SECONDS", 900),
  accessIssuer: () => process.env.JWT_ISSUER ?? "msngan-api",
  accessAudience: () => process.env.JWT_AUDIENCE ?? "msngan-web",
  refreshTtlSeconds: () => integer("REFRESH_TOKEN_TTL_SECONDS", 2_592_000),
  cookieSecure: () => process.env.COOKIE_SECURE === "true",
  exposeDevTokens: () =>
    process.env.NODE_ENV !== "production" && process.env.AUTH_EXPOSE_DEV_TOKENS === "true",
};

export function validateEnvironment() {
  authConfig.accessSecret();
  authConfig.accessTtlSeconds();
  authConfig.refreshTtlSeconds();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  if (process.env.NODE_ENV === "production" && !authConfig.cookieSecure()) {
    throw new Error("COOKIE_SECURE must be true in production.");
  }
}
