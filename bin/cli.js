#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const helpText = `
MongoDB Model Context Protocol (MCP) Server for GitHub Copilot

Usage:
  mongodb-mcp [options] [database-name]

Options:
  --help, -h       Show this help message
  --version, -v    Show version number
  --read-only      Run server in read-only mode
  --read-write     Run server in read-write mode (default)
  --mode MODE      Set server mode (read-only or read-write)
  --db NAME        Database name to use

Arguments:
  database-name    Database name to use (default: test)

Environment Variables (REQUIRED for credentials):
  MONGODB_URI      MongoDB connection URI (REQUIRED - do not pass as argument)
  MONGODB_DB       Database name to use (optional)
  SERVER_MODE      Server mode: read-only or read-write (optional)
  LOG_DIR          Directory for log files (optional, default: ./logs)

Examples:
  # Set connection URI via environment variable
  export MONGODB_URI="mongodb://localhost:27017"
  mongodb-mcp

  # With specific database
  mongodb-mcp --db mydb

  # Read-only mode
  mongodb-mcp --read-only mydb

Security Note:
  Never pass MongoDB connection URIs as command-line arguments as they
  may contain credentials that will be visible in process listings.
  Always use the MONGODB_URI environment variable.
`;

// Handle command-line options
if (args.includes('--help') || args.includes('-h')) {
  console.log(helpText);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  // Read version from package.json
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = await import(packageJsonPath, { assert: { type: 'json' } });
    console.log(`MongoDB MCP Server v${packageJson.default.version}`);
    process.exit(0);
  } catch (error) {
    console.error('Could not determine version:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Filter out options from arguments
const filteredArgs = args.filter((arg) => !arg.startsWith('-'));

// Launch the actual MCP server using spawn for better process handling
const serverPath = join(__dirname, '..', 'dist', 'index.js');
const nodeProcess = spawn('node', [serverPath, ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// Handle process termination
nodeProcess.on('error', (error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

nodeProcess.on('exit', (code, signal) => {
  if (signal) {
    console.log(`Server terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code || 0);
});

// Forward signals to child process
['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => {
  process.on(signal, () => {
    nodeProcess.kill(signal);
  });
});
