export interface FilterValidationResult {
  isValid: boolean;
  isEmpty: boolean;
  isMatchAll: boolean;
  warning?: string;
}

/**
 * Generates smart warning based on document count
 */
export function getOperationWarning(count: number, operation: 'update' | 'delete'): string | undefined {
  if (count === 0) {
    return undefined;
  }

  if (count >= 1000) {
    return `⚠⚠ LARGE OPERATION: Will ${operation} ${count.toLocaleString()} documents`;
  } else if (count >= 100) {
    return `⚠ Large operation: Will ${operation} ${count} documents`;
  } else if (count > 10) {
    return `Will ${operation} ${count} documents`;
  }

  return undefined; // Small operations (1-10) get no warning
}

/**
 * Validates a MongoDB filter for safety concerns
 */
export function validateFilter(filter: Record<string, any>): FilterValidationResult {
  const isEmpty = !filter || Object.keys(filter).length === 0;
  const isMatchAll = isEmpty;

  let warning: string | undefined;

  if (isEmpty) {
    warning = 'Empty filter will match ALL documents in the collection';
  }

  return {
    isValid: true,
    isEmpty,
    isMatchAll,
    warning
  };
}

/**
 * Checks if a filter should be blocked based on safety settings
 */
export function shouldBlockFilter(
  filter: Record<string, any>,
  allowEmptyFilter: boolean = false,
  operation?: string
): { blocked: boolean; reason?: string } {
  const validation = validateFilter(filter);

  if (validation.isEmpty && !allowEmptyFilter) {
    const operationName = operation || 'operation';
    return {
      blocked: true,
      reason: `⚠ Operation blocked for safety

Filter: {} (empty - matches ALL documents)

To preview impact: Add {dryRun: true}
To proceed anyway: Add {allowEmptyFilter: true}
Recommended: Use preview${operationName.charAt(0).toUpperCase() + operationName.slice(1)}() first`
    };
  }

  return { blocked: false };
}
