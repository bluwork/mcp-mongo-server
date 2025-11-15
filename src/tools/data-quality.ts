import type { Db } from 'mongodb';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logToolUsage, logError } from '../utils/logger.js';
import { preprocessQuery } from '../utils/query-preprocessor.js';

export function registerDataQualityTools(server: McpServer, db: Db, mode: string): void {
  const registerTool = (toolName: string, description: string, schema: any, handler: (args?: any) => any, writeOperation = false) => {
    if (writeOperation && mode === 'read-only') {
      return;
    }
    server.tool(toolName, description, schema, handler);
  };

  registerTool(
    'findDuplicates',
    'Find duplicate documents based on one or more fields. Useful for data cleanup before adding unique constraints.',
    {
      collection: z.string(),
      fields: z.array(z.string()),
      options: z.object({
        limit: z.number().positive().max(1000).optional(),
        minCount: z.number().int().min(2).optional(),
        sort: z.enum(['count', 'value']).optional(),
        includeDocuments: z.boolean().optional(),
      }).optional(),
    },
    async (args) => {
      logToolUsage('findDuplicates', args);
      const { collection, fields, options = {} } = args;
      const {
        limit = 100,
        minCount = 2,
        sort = 'count',
        includeDocuments = true,
      } = options;

      try {
        const collectionObj = db.collection(collection);

        // Build aggregation pipeline
        const pipeline: any[] = [];

        // Group stage - single field vs composite key
        const groupId = fields.length === 1
          ? `$${fields[0]}`
          : fields.reduce((acc: Record<string, string>, field: string) => {
              acc[field] = `$${field}`;
              return acc;
            }, {} as Record<string, string>);

        const groupStage: any = {
          $group: {
            _id: groupId,
            count: { $sum: 1 },
          },
        };

        // Include documents or just IDs
        if (includeDocuments) {
          groupStage.$group.documents = { $push: '$$ROOT' };
        } else {
          groupStage.$group.documentIds = { $push: '$_id' };
        }

        pipeline.push(groupStage);

        // Filter for duplicates
        pipeline.push({
          $match: {
            count: { $gte: minCount },
          },
        });

        // Sort by count or value
        pipeline.push({
          $sort: sort === 'count' ? { count: -1 } : { _id: 1 },
        });

        // Limit results
        pipeline.push({ $limit: limit });

        // Project final shape
        const projectStage: any = {
          $project: {
            value: '$_id',
            count: 1,
            _id: 0,
          },
        };

        if (includeDocuments) {
          projectStage.$project.documents = { $slice: ['$documents', 5] };
        } else {
          projectStage.$project.documentIds = { $slice: ['$documentIds', 10] };
        }

        pipeline.push(projectStage);

        const duplicateGroups = await collectionObj.aggregate(pipeline).toArray();

        // Calculate statistics
        const totalDocuments = await collectionObj.countDocuments({});
        const affectedDocuments = duplicateGroups.reduce((sum, group) => sum + group.count, 0);
        const uniqueDocuments = totalDocuments - affectedDocuments + duplicateGroups.length;
        const duplicatePercentage = totalDocuments > 0 ? (affectedDocuments / totalDocuments) * 100 : 0;

        // Generate recommendations
        const recommendations: string[] = [];

        if (duplicateGroups.length === 0) {
          recommendations.push('✓ No duplicates found');
        } else {
          if (duplicatePercentage > 10) {
            recommendations.push(`⚠ High duplicate rate (${duplicatePercentage.toFixed(1)}%) - consider data cleanup`);
          }

          if (fields.length === 1 && duplicateGroups.length > 0) {
            recommendations.push(
              `Consider adding unique index: createIndex("${collection}", {${fields[0]}: 1}, {unique: true})`
            );
          }

          if (affectedDocuments > 1000) {
            recommendations.push(
              'Use deleteMany with filter after manual review to clean up duplicates'
            );
          } else if (affectedDocuments > 0) {
            recommendations.push(
              `${affectedDocuments} documents have duplicates - review and clean up as needed`
            );
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  collection,
                  fieldsCombination: fields,
                  totalDuplicateGroups: duplicateGroups.length,
                  affectedDocuments,
                  statistics: {
                    totalDocuments,
                    uniqueDocuments,
                    duplicateDocuments: affectedDocuments,
                    duplicatePercentage: parseFloat(duplicatePercentage.toFixed(2)),
                  },
                  duplicateGroups,
                  recommendations,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logError('findDuplicates', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error finding duplicates: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  registerTool(
    'cloneCollection',
    'Clone a collection with optional filtering and index copying. Supports dryRun mode for preview.',
    {
      source: z.string(),
      destination: z.string(),
      options: z.object({
        filter: z.record(z.any()).optional(),
        includeIndexes: z.boolean().optional(),
        dropIfExists: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        projection: z.record(z.any()).optional(),
      }).optional(),
    },
    async (args) => {
      logToolUsage('cloneCollection', args);
      const { source, destination, options = {} } = args;
      const {
        filter = {},
        includeIndexes = true,
        dropIfExists = false,
        dryRun = false,
        projection,
      } = options;

      try {
        const warnings: string[] = [];

        // Validate source and destination
        if (source === destination) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Source and destination cannot be the same collection',
              },
            ],
          };
        }

        // Check if source exists
        const collections = await db.listCollections({ name: source }).toArray();
        if (collections.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Source collection '${source}' does not exist\n\nSuggestion: Use listCollections() to see available collections`,
              },
            ],
          };
        }

        // Check if destination exists
        const destCollections = await db.listCollections({ name: destination }).toArray();
        const destExists = destCollections.length > 0;

        if (destExists && !dropIfExists) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Destination collection '${destination}' already exists\n\nSuggestion: Use dropIfExists: true or choose different name`,
              },
            ],
          };
        }

        if (destExists && dropIfExists) {
          warnings.push(`⚠ Destination collection '${destination}' will be dropped`);
        }

        // Get source stats
        const sourceStats = await db.command({ collStats: source });
        const processedFilter = preprocessQuery(filter);
        const matchCount = await db.collection(source).countDocuments(processedFilter);
        const indexes = await db.collection(source).indexes();

        // Dry run mode
        if (dryRun) {
          const estimatedSize = matchCount > 0
            ? Math.floor(sourceStats.size * (matchCount / sourceStats.count))
            : 0;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    dryRun: true,
                    source: {
                      collection: source,
                      documentCount: sourceStats.count,
                      documentsToCopy: matchCount,
                      sizeBytes: sourceStats.size,
                      indexes: indexes.length,
                    },
                    destination: {
                      collection: destination,
                      existed: destExists,
                      willDrop: destExists && dropIfExists,
                      estimatedSize,
                    },
                    warnings,
                    estimatedTimeMs: Math.floor(matchCount / 1000) * 100,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const startTime = Date.now();

        // Drop destination if it exists
        if (destExists && dropIfExists) {
          await db.collection(destination).drop();
        }

        // Clone using aggregation $out for efficiency
        const pipeline: any[] = [{ $match: processedFilter }];

        if (projection) {
          pipeline.push({ $project: projection });
        }

        pipeline.push({ $out: destination });

        await db.collection(source).aggregate(pipeline).toArray();

        let indexesCopied = 0;

        // Copy indexes
        if (includeIndexes) {
          for (const index of indexes) {
            if (index.name === '_id_') continue; // Skip default _id index

            const indexSpec = index.key;
            const indexOptions: any = {
              name: index.name,
            };

            if (index.unique) indexOptions.unique = true;
            if (index.sparse) indexOptions.sparse = true;
            if (index.expireAfterSeconds !== undefined) {
              indexOptions.expireAfterSeconds = index.expireAfterSeconds;
            }

            try {
              await db.collection(destination).createIndex(indexSpec, indexOptions);
              indexesCopied++;
            } catch (err) {
              // Index creation might fail if projection removed indexed fields
              warnings.push(`Failed to copy index '${index.name}': ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        const executionTimeMs = Date.now() - startTime;
        const destStats = await db.command({ collStats: destination });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  source: { collection: source, documentCount: sourceStats.count },
                  destination: {
                    collection: destination,
                    documentsCopied: destStats.count,
                    indexesCopied,
                    sizeBytes: destStats.size,
                  },
                  executionTimeMs,
                  warnings: warnings.length > 0 ? warnings : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logError('cloneCollection', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error cloning collection: ${errorMessage}`,
            },
          ],
        };
      }
    },
    true
  );

  registerTool(
    'exportCollection',
    'Export collection data to JSON, JSONL, or CSV format. Returns data directly or saves to file if output path provided.',
    {
      collection: z.string(),
      options: z.object({
        format: z.enum(['json', 'jsonl', 'csv']).optional(),
        filter: z.record(z.any()).optional(),
        projection: z.record(z.any()).optional(),
        limit: z.number().positive().optional(),
        sort: z.record(z.number()).optional(),
        flatten: z.boolean().optional(),
        pretty: z.boolean().optional(),
      }).optional(),
    },
    async (args) => {
      logToolUsage('exportCollection', args);
      const { collection, options = {} } = args;
      const {
        format = 'json',
        filter = {},
        projection,
        limit,
        sort,
        flatten = true,
        pretty = false,
      } = options;

      try {
        const warnings: string[] = [];
        const processedFilter = preprocessQuery(filter);

        // Get documents
        let cursor = db.collection(collection).find(processedFilter);

        if (projection) cursor = cursor.project(projection);
        if (sort) cursor = cursor.sort(sort);
        if (limit) cursor = cursor.limit(limit);

        const documents = await cursor.toArray();

        if (documents.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  documentsExported: 0,
                  message: 'No documents match filter',
                  suggestion: 'Check filter criteria or use find() to verify data exists',
                }, null, 2),
              },
            ],
          };
        }

        const startTime = Date.now();
        let data: string;
        let sizeBytes: number;

        switch (format) {
          case 'json': {
            data = pretty
              ? JSON.stringify(documents, null, 2)
              : JSON.stringify(documents);
            sizeBytes = Buffer.byteLength(data, 'utf8');
            break;
          }

          case 'jsonl': {
            data = documents.map(doc => JSON.stringify(doc)).join('\n');
            sizeBytes = Buffer.byteLength(data, 'utf8');
            break;
          }

          case 'csv': {
            // Flatten nested objects if requested
            const processedDocs = flatten
              ? documents.map(doc => flattenObject(doc))
              : documents;

            // Get all unique headers
            const headersSet = new Set<string>();
            processedDocs.forEach(doc => {
              Object.keys(doc).forEach(key => headersSet.add(key));
            });
            const headers = Array.from(headersSet);

            // Build CSV
            const csvRows: string[] = [];
            csvRows.push(headers.join(','));

            for (const doc of processedDocs) {
              const row = headers.map(header => {
                const value = doc[header];

                if (value === null || value === undefined) {
                  return '';
                }
                if (typeof value === 'object') {
                  return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                if (typeof value === 'string') {
                  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                  }
                  return value;
                }
                return String(value);
              });

              csvRows.push(row.join(','));
            }

            data = csvRows.join('\n');
            sizeBytes = Buffer.byteLength(data, 'utf8');

            // Check for nested structures in non-flatten mode
            if (!flatten && documents.some(doc =>
              Object.values(doc).some(val =>
                typeof val === 'object' && val !== null && !(val instanceof Date)
              )
            )) {
              warnings.push('⚠ Document contains nested objects. Consider using flatten: true for better CSV compatibility');
            }
            break;
          }

          default:
            throw new Error(`Unsupported format: ${format}`);
        }

        const executionTimeMs = Date.now() - startTime;

        // Warn for large exports
        if (sizeBytes > 1000000) { // > 1MB
          warnings.push('⚠ Large export - consider saving to file or using limit parameter');
        }

        const result: any = {
          collection,
          format,
          documentsExported: documents.length,
          sizeBytes,
          executionTimeMs,
        };

        if (warnings.length > 0) {
          result.warnings = warnings;
        }

        // For reasonable sizes, include the data
        if (sizeBytes <= 100000) { // <= 100KB
          result.data = format === 'json' ? documents : data;
        } else {
          result.preview = data.substring(0, 200) + '...';
          result.message = 'Data too large to display. Use limit parameter to reduce size.';
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logError('exportCollection', error, args);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error exporting collection: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );
}

// Helper function to flatten nested objects for CSV export
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      flattened[newKey] = value;
    } else if (Array.isArray(value)) {
      // Convert arrays to JSON string for CSV
      flattened[newKey] = JSON.stringify(value);
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      // Check for ObjectId and other MongoDB types
      if (value.constructor.name === 'ObjectId') {
        flattened[newKey] = value.toString();
      } else {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      }
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}
