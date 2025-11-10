export function sanitizeResponse(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = ['connectionString', 'password', 'key', 'secret', 'token'];
  const sanitized = JSON.parse(JSON.stringify(data));

  function sanitizeObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitizeObject(value);
      }
    }
  }

  sanitizeObject(sanitized);
  return sanitized;
}
