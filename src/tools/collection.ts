import type { Db } from 'mongodb';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logToolUsage, logError } from '../utils/logger.js';

export function registerCollectionTools(server: McpServer, db: Db, mode: string): void {
  const registerTool = (toolName: string, description: string, schema: any, handler: (args?: any) => any, writeOperation = false) => {
    if (writeOperation && mode === 'read-only') {
      return;
    }
    server.tool(toolName, description, schema, handler);
  };

  registerTool('listCollections', 'List all collections in the database', {}, async () => {
    logToolUsage('listCollections', {});
    try {
      const collections = await db.collections();
      return {
        content: [
          {
            type: 'text',
            text: collections.map((c) => c.collectionName).join('\n'),
          },
        ],
      };
    } catch (error) {
      logError('listCollections', error);
      throw error;
    }
  });

  registerTool(
    'createCollection',
    'Create a new collection in the database',
    {
      name: z.string(),
      options: z.record(z.any()).optional(),
    },
    async (args) => {
      logToolUsage('createCollection', args);
      const { name, options = {} } = args;
      try {
        await db.createCollection(name, options);
        return {
          content: [
            {
              type: 'text',
              text: `Collection '${name}' created successfully.`,
            },
          ],
        };
      } catch (error) {
        logError('createCollection', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error creating collection: ${errorMessage}`,
            },
          ],
        };
      }
    },
    true
  );

  registerTool(
    'dropCollection',
    'Drop a collection from the database',
    {
      name: z.string(),
    },
    async (args) => {
      logToolUsage('dropCollection', args);
      const { name } = args;
      try {
        const result = await db.collection(name).drop();
        return {
          content: [
            {
              type: 'text',
              text: result ? `Collection '${name}' dropped successfully.` : `Failed to drop collection '${name}'.`,
            },
          ],
        };
      } catch (error) {
        logError('dropCollection', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error dropping collection: ${errorMessage}`,
            },
          ],
        };
      }
    },
    true
  );

  registerTool(
    'getCollectionStats',
    'Get statistics for a collection',
    {
      collection: z.string(),
    },
    async (args) => {
      logToolUsage('getCollectionStats', args);
      const { collection } = args;
      try {
        const stats = await db.command({ collStats: collection });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        logError('getCollectionStats', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting collection stats: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );
}
