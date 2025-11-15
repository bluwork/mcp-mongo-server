/**
 * Response filtering utilities for optimizing token usage
 */
import type { VerbosityLevel } from '../types.js';

/**
 * Removes fields with zero, null, undefined, or empty values from an object
 */
export function excludeZeroMetrics<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip zero values, null, undefined
    if (value === 0 || value === null || value === undefined) {
      continue;
    }

    // Skip empty arrays
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    // Skip empty objects
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }

    result[key as keyof T] = value as T[keyof T];
  }

  return result;
}

/**
 * Filters collection stats based on verbosity level
 */
export function filterCollectionStats(stats: Record<string, unknown>, verbosity: VerbosityLevel): Record<string, unknown> {
  if (verbosity === 'full') {
    return stats;
  }

  const filtered: Record<string, unknown> = {
    ns: stats.ns,
    count: stats.count,
    size: stats.size,
    avgObjSize: stats.avgObjSize,
    storageSize: stats.storageSize,
    nindexes: stats.nindexes,
    totalIndexSize: stats.totalIndexSize,
    indexSizes: stats.indexSizes
  };

  if (verbosity === 'standard') {
    filtered.capped = stats.capped;
    filtered.max = stats.max;
    filtered.freeStorageSize = stats.freeStorageSize;
  }

  return filtered;
}

/**
 * Filters database stats based on verbosity level
 */
export function filterDatabaseStats(stats: Record<string, unknown>, verbosity: VerbosityLevel): Record<string, unknown> {
  if (verbosity === 'full') {
    return stats;
  }

  const filtered: Record<string, unknown> = {
    db: stats.db,
    collections: stats.collections,
    views: stats.views,
    objects: stats.objects,
    avgObjSize: stats.avgObjSize,
    dataSize: stats.dataSize,
    storageSize: stats.storageSize,
    indexes: stats.indexes,
    indexSize: stats.indexSize,
    totalSize: stats.totalSize
  };

  if (verbosity === 'standard') {
    filtered.scaleFactor = stats.scaleFactor;
    filtered.freeStorageSize = stats.freeStorageSize;
  }

  return filtered;
}

/**
 * Filters server status based on flags
 */
export function filterServerStatus(
  stats: Record<string, unknown>,
  options: {
    includeWiredTiger?: boolean;
    includeReplication?: boolean;
    includeStorageEngine?: boolean;
  }
): Record<string, unknown> {
  const filtered = { ...stats };

  if (!options.includeWiredTiger && filtered.wiredTiger) {
    delete filtered.wiredTiger;
  }

  if (!options.includeReplication && filtered.repl) {
    delete filtered.repl;
  }

  if (!options.includeStorageEngine && filtered.storageEngine) {
    delete filtered.storageEngine;
  }

  return filtered;
}

/**
 * Filters profiler entry based on verbosity level
 */
export function filterProfilerEntry(entry: Record<string, unknown>, verbosity: VerbosityLevel): Record<string, unknown> {
  if (verbosity === 'full') {
    return entry;
  }

  const filtered: Record<string, unknown> = {
    op: entry.op,
    ns: entry.ns,
    millis: entry.millis,
    ts: entry.ts
  };

  if (verbosity === 'standard') {
    filtered.planSummary = entry.planSummary;
    filtered.docsExamined = entry.docsExamined;
    filtered.keysExamined = entry.keysExamined;
    filtered.nreturned = entry.nreturned;
    filtered.user = entry.user;
  }

  return filtered;
}

/**
 * Filters slow operation based on includeQueryDetails flag
 */
export function filterSlowOperation(
  op: Record<string, unknown>,
  includeQueryDetails: boolean
): Record<string, unknown> {
  if (includeQueryDetails) {
    return op;
  }

  const filtered = { ...op };
  delete filtered.query;
  delete filtered.lockStats;

  return filtered;
}
