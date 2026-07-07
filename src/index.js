/**
 * @fileoverview CHEX — regex-driven JSON schema validation for Bun and
 * compiled CLI usage.
 *
 * The default export `Chex` is a static-class facade preserved for backward
 * compatibility. New code should prefer the named export:
 *
 *   import { validateData } from './index.js';
 *
 * @author Chidelma
 * @license MIT
 */

import {
  normalizeSchemaDir,
  normalizeSchemaPath,
  getSchemaPath,
  loadSchema,
  loadCollectionSchema,
} from './schema/loader.js';
import { isRecordType } from './schema/shape.js';
import { validateData } from './validation/validate.js';

export {
  validateData,
  isRecordType,
  normalizeSchemaDir,
  normalizeSchemaPath,
  loadSchema,
};

export * from './errors.js';

/**
 * Static-class facade preserved for backward compatibility.
 */
export default class Chex {
  /** @type {Map<string, Record<string, unknown>>} */
  static schemaCache = new Map();

  /** @deprecated Use `schemaCache`. */
  static collectionSchemas = Chex.schemaCache;

  static normalizeSchemaDir = normalizeSchemaDir;
  static normalizeSchemaPath = normalizeSchemaPath;
  static isRecordType = isRecordType;

  static getSchemaPath(schemaName) {
    return getSchemaPath(schemaName, undefined);
  }

  static loadSchema(schemaPath) {
    return loadSchema({ schemaPath });
  }

  static loadCollectionSchema(schemaName) {
    return loadCollectionSchema(schemaName, undefined);
  }

  /**
   * @param {string} schemaRef
   * @param {Record<string, unknown>} data
   * @param {{ schemaPath?: string|null, schemaDir?: string|null, cache?: Map<string, Record<string, unknown>> }} [options]
   * @returns {Promise<Record<string, unknown>>}
   */
  static validateData(schemaRef, data, options = {}) {
    return validateData(schemaRef, data, {
      schemaPath: options.schemaPath,
      cache: this.schemaCache,
      ...options,
    });
  }
}
