import type { MongoClient } from 'mongodb';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logToolUsage, logError } from '../utils/logger.js';

export function registerDatabaseTools(server: McpServer, client: MongoClient, mode: string): void {
  const registerTool = (toolName: string, description: string, schema: any, handler: (args?: any) => any, writeOperation = false) => {
    if (writeOperation && mode === 'read-only') {
      return;
    }
    server.tool(toolName, description, schema, handler);
  };

  registerTool('listDatabases', 'List all databases in the MongoDB instance', {}, async () => {
    logToolUsage('listDatabases', {});
    try {
      const databasesList = await client.db().admin().listDatabases();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(databasesList.databases, null, 2),
          },
        ],
      };
    } catch (error) {
      logError('listDatabases', error);
      throw error;
    }
  });
}
