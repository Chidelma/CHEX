/**
 * @fileoverview Runtime validation of data against a collection schema.
 *
 * All leaf values in CHEX schemas are regex pattern strings. Data values
 * are coerced to strings and tested against the pattern. The `?` suffix
 * on schema keys marks nullable fields.
 */

import { sanitizePropertyName, isRecordType } from '../declaration/properties.js';
import { loadCollectionSchema } from '../schema/loader.js';
import { InvalidNameError, ValidationError } from '../errors.js';

const MAX_REGEX_LENGTH = 500;
const MESSAGE_TRUNCATE_AT = 100;

const truncate = (s, n = MESSAGE_TRUNCATE_AT) =>
  s.length > n ? s.slice(0, n) + '...' : s;

/**
 * Compile a regex string with a length guard so a hostile pattern can't
 * burn the event loop.
 * @param {string} pattern
 * @param {string} fullPath
 * @param {string} collection
 * @returns {RegExp}
 */
function compileGuardedRegex(pattern, fullPath, collection) {
  if (pattern.length > MAX_REGEX_LENGTH) {
    throw new ValidationError(
      `Regex pattern for '${truncate(fullPath)}' in '${truncate(collection)}' collection exceeds maximum allowed length`
    );
  }
  try {
    return new RegExp(pattern);
  } catch {
    throw new ValidationError(
      `Invalid RegEx pattern for '${truncate(fullPath)}' in '${truncate(collection)}' collection`
    );
  }
}

/**
 * Validate a single leaf value against a regex pattern.
 * @param {unknown} dataValue
 * @param {string} pattern
 * @param {string} fullPath
 * @param {string} collection
 */
function validateLeaf(dataValue, pattern, fullPath, collection) {
  const regEx = compileGuardedRegex(pattern, fullPath, collection);
  if (!regEx.test(String(dataValue))) {
    throw new ValidationError(
      `RegEx pattern fails for property '${truncate(fullPath)}' in '${truncate(collection)}' collection`
    );
  }
}

/**
 * Validate `data` against `schema` recursively. All leaf schema values
 * are regex pattern strings tested against `String(dataValue)`.
 * @param {Record<string, unknown>} data
 * @param {Record<string, unknown>} schema
 * @param {string} collection
 * @param {string} [path]
 * @returns {Record<string, unknown>}
 */
function validateObject(data, schema, collection, path) {
  // Reject data properties not declared in the schema. Schema keys may carry
  // a trailing `?` for nullability; data keys never do, so check both forms.
  for (const dataKey in data) {
    if (!(dataKey in schema) && !(`${dataKey}?` in schema)) {
      throw new ValidationError(
        `Property '${truncate(dataKey)}' does not exist in the '${truncate(collection)}' collection schema`
      );
    }
  }

  for (const schemaKey in schema) {
    const schemaValue = schema[schemaKey];
    const isNullable = schemaKey.endsWith('?');
    // Use the raw key (sigil stripped) to index `data`. Use the sanitized
    // key — which may be quoted for non-identifier names — only for display.
    const dataKey = isNullable ? schemaKey.slice(0, -1) : schemaKey;
    const displayKey = sanitizePropertyName(schemaKey);
    const dataValue = data[dataKey];
    const fullPath = path ? `${path}.${displayKey}` : displayKey;
    const valueIsDefined = dataValue !== null && dataValue !== undefined;

    // ── Leaf: regex pattern string ──────────────────────────────────
    if (typeof schemaValue === 'string') {
      if (!valueIsDefined && isNullable) continue;
      if (!valueIsDefined) {
        throw new ValidationError(
          `Property '${truncate(fullPath)}' cannot be null or undefined in '${truncate(collection)}' collection`
        );
      }
      validateLeaf(dataValue, schemaValue, fullPath, collection);
      continue;
    }

    // ── Array: single-element regex applied to every data element ───
    if (Array.isArray(schemaValue)) {
      if (!valueIsDefined && isNullable) continue;
      if (!valueIsDefined) {
        throw new ValidationError(
          `Property '${truncate(fullPath)}' cannot be null or undefined in '${truncate(collection)}' collection`
        );
      }
      if (!Array.isArray(dataValue)) {
        throw new ValidationError(
          `Type mismatch for '${truncate(fullPath)}' in '${truncate(collection)}' collection: expected an array`
        );
      }
      if (schemaValue.length > 0 && typeof schemaValue[0] === 'string') {
        for (const item of dataValue) {
          validateLeaf(item, schemaValue[0], fullPath, collection);
        }
      }
      continue;
    }

    // ── Object: nested structure or Record ──────────────────────────
    if (typeof schemaValue === 'object' && schemaValue !== null) {
      if (!valueIsDefined && isNullable) continue;
      if (!valueIsDefined) {
        throw new ValidationError(
          `Property '${truncate(fullPath)}' cannot be null or undefined in '${truncate(collection)}' collection`
        );
      }
      if (typeof dataValue !== 'object' || dataValue === null || Array.isArray(dataValue)) {
        throw new ValidationError(
          `Type mismatch for '${truncate(fullPath)}' in '${truncate(collection)}' collection: expected an object`
        );
      }

      if (isRecordType(schemaValue)) {
        const keyPattern = Object.keys(schemaValue)[0];
        const valuePattern = schemaValue[keyPattern];
        if (typeof valuePattern === 'string') {
          for (const [k, v] of Object.entries(dataValue)) {
            validateLeaf(k, keyPattern, `${fullPath}.<key:${k}>`, collection);
            validateLeaf(v, valuePattern, `${fullPath}.${k}`, collection);
          }
        }
      } else {
        validateObject(dataValue, schemaValue, collection, fullPath);
      }
      continue;
    }
  }

  return data;
}

/**
 * Validate a data object against the schema for `collection`. Loads the
 * schema from `options.schemaDir` (or `process.env.CHEX_SCHEMA_DIR`), caches
 * it in `options.cache` (or a module-local cache), and returns the
 * validated data.
 *
 * @template {Record<string, unknown>} T
 * @param {string} collection
 * @param {T} data
 * @param {{ schemaDir?: string|null, cache?: Map<string, Record<string, unknown>> }} [options]
 * @returns {Promise<T>}
 */
const defaultCache = new Map();

export async function validateData(collection, data, options = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(collection)) {
    throw new InvalidNameError('Invalid collection name');
  }

  const schemaDir = options.schemaDir ?? process.env.CHEX_SCHEMA_DIR;
  const cache = options.cache ?? defaultCache;

  let schema = cache.get(collection);
  if (!schema) {
    schema = await loadCollectionSchema(collection, schemaDir);
    cache.set(collection, schema);
  }

  return /** @type {T} */ (validateObject(data, schema, collection));
}
