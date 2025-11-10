const adminOpLimiter = new Map<string, { count: number; resetTime: number }>();
const ADMIN_RATE_LIMIT = 100; // requests per minute
const ADMIN_WINDOW_MS = 60000; // 1 minute

export function checkAdminRateLimit(operation: string): boolean {
  const now = Date.now();
  const key = operation;
  const current = adminOpLimiter.get(key) || { count: 0, resetTime: now + ADMIN_WINDOW_MS };

  if (now > current.resetTime) {
    current.count = 0;
    current.resetTime = now + ADMIN_WINDOW_MS;
  }

  if (current.count >= ADMIN_RATE_LIMIT) {
    return false;
  }

  current.count++;
  adminOpLimiter.set(key, current);
  return true;
}

export { ADMIN_RATE_LIMIT };
