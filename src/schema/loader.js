/**
 * @fileoverview Schema directory resolution and JSON loading.
 */

import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaLoadError } from '../errors.js';

/**
 * Normalize a schema directory path so callers may pass file:// URLs or
 * the leading-slash Windows form returned by URL APIs.
 * @param {string} schemaDir
 * @returns {string}
 */
export function normalizeSchemaDir(schemaDir) {
  if (schemaDir.startsWith('file:')) {
    return fileURLToPath(schemaDir);
  }
  if (/^\/[A-Za-z]:\//.test(schemaDir)) {
    return schemaDir.slice(1);
  }
  return schemaDir;
}

/**
 * Build the full path to a collection's JSON schema file.
 * @param {string} collection
 * @param {string|undefined|null} schemaDir
 * @returns {string}
 */
export function getSchemaPath(collection, schemaDir) {
  if (!schemaDir) {
    throw new ConfigError('CHEX_SCHEMA_DIR is not configured');
  }
  const normalized = normalizeSchemaDir(schemaDir).replace(/[\\/]+$/, '');
  return `${normalized}/${collection}.json`;
}

/**
 * Load a collection schema as a plain object.
 * @param {string} collection
 * @param {string|undefined|null} schemaDir
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadCollectionSchema(collection, schemaDir) {
  const schemaPath = getSchemaPath(collection, schemaDir);

  try {
    if (typeof Bun !== 'undefined' && typeof window === 'undefined') {
      return await Bun.file(schemaPath).json();
    }
    const res = await import(schemaPath);
    return res.default;
  } catch (cause) {
    throw new SchemaLoadError(`Failed to load schema for the specified collection`, { cause });
  }
}
