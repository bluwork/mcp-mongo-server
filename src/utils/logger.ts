import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || './logs';
const TOOL_LOG_FILE = path.join(LOG_DIR, 'tool-usage.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function logToolUsage(toolName: string, args: any, callerInfo?: string): void {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] TOOL CALLED: ${toolName}\nArgs: ${JSON.stringify(args, null, 2)}\nCaller: ${
    callerInfo || 'Unknown'
  }\n-------------------\n`;

  fs.appendFileSync(TOOL_LOG_FILE, logEntry);
  console.log(`Tool called: ${toolName}`);
}

export function logError(toolName: string, error: any, args?: any): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : 'No stack trace';

  const logEntry = `[${timestamp}] ERROR IN TOOL: ${toolName}\nError: ${errorMessage}\nStack: ${errorStack}\nArgs: ${JSON.stringify(
    args,
    null,
    2,
  )}\n-------------------\n`;

  fs.appendFileSync(ERROR_LOG_FILE, logEntry);
  console.error(`Error in tool ${toolName}: ${errorMessage}`);
}
