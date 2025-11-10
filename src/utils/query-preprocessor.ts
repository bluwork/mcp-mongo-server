import { ObjectId } from 'mongodb';

function isObjectIdField(fieldName: string): boolean {
  const objectIdPatterns = [
    /^_id$/,
    /Id$/,
    /^id$/i,
    /_id$/,
    /^ref/i,
  ];

  return objectIdPatterns.some(pattern => pattern.test(fieldName));
}

function preprocessQueryValue(value: any, fieldName?: string): any {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const processed: any = {};
  const isObjectIdFieldName = fieldName ? isObjectIdField(fieldName) : false;

  for (const [operator, operatorValue] of Object.entries(value)) {
    if (operator.startsWith('$')) {
      if (Array.isArray(operatorValue)) {
        processed[operator] = operatorValue.map(item => {
          if (isObjectIdFieldName && typeof item === 'string' && ObjectId.isValid(item)) {
            return new ObjectId(item);
          }
          return item;
        });
      } else if (isObjectIdFieldName && typeof operatorValue === 'string' && ObjectId.isValid(operatorValue)) {
        processed[operator] = new ObjectId(operatorValue);
      } else {
        processed[operator] = operatorValue;
      }
    } else {
      processed[operator] = operatorValue;
    }
  }

  return processed;
}

export function preprocessQuery(query: any): any {
  if (!query || typeof query !== 'object') {
    return query;
  }

  const processed: any = {};

  for (const [key, value] of Object.entries(query)) {
    if (isObjectIdField(key)) {
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        processed[key] = new ObjectId(value);
      } else if (typeof value === 'object' && value !== null) {
        processed[key] = preprocessQueryValue(value, key);
      } else {
        processed[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      processed[key] = preprocessQuery(value);
    } else if (Array.isArray(value)) {
      processed[key] = value.map(item => {
        if (isObjectIdField(key) && typeof item === 'string' && ObjectId.isValid(item)) {
          return new ObjectId(item);
        }
        return typeof item === 'object' ? preprocessQuery(item) : item;
      });
    } else {
      processed[key] = value;
    }
  }

  return processed;
}
