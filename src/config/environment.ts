import type { AppConfig } from '../types.js';

export function parseArgs(): AppConfig {
  const args = process.argv.slice(2);
  let uri: string | undefined;
  let dbName: string | undefined;
  let mode = 'read-only';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--read-only') {
      mode = 'read-only';
    } else if (arg === '--read-write') {
      mode = 'read-write';
    } else if (arg === '--mode' && i + 1 < args.length) {
      mode = args[++i];
    } else if (!uri) {
      uri = arg;
    } else if (!dbName) {
      dbName = arg;
    }
  }

  uri = uri || 'mongodb://localhost:27017';
  dbName = dbName || 'test';

  return { uri, dbName, mode, logDir: './logs' };
}
