import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "auth";
export const AUTH_MAX_AGE = 90 * 24 * 60 * 60;

// The cookie is an HMAC keyed by APP_PASSWORD, so changing the password logs every device out
function token(): string | undefined {
  const password = process.env.APP_PASSWORD;
  return password ? createHmac("sha256", password).update("wuwa-planner:auth:v1").digest("hex") : undefined;
}

// Compare byte lengths, not string lengths: timingSafeEqual throws on unequal buffers (e.g. non-ASCII input)
const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

export function isValidCookie(value: string | undefined): boolean {
  const expected = token();
  return !!expected && !!value && same(value, expected);
}

// Returns the cookie value to set, or undefined for a wrong password (or no APP_PASSWORD configured)
export function login(password: string): string | undefined {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !same(password, expected)) return undefined;
  return token();
}
