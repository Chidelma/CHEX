/**
 * @fileoverview CHEX — JSON-schema-driven validation and TypeScript
 * declaration generation for Bun.
 *
 * The default export `Generator` is a static-class facade preserved for
 * backward compatibility. New code should prefer the named exports:
 *
 *   import { generateDeclaration, validateData } from '@d31ma/chex';
 *
 * @author Chidelma
 * @license MIT
 */

import {
  generateDeclaration,
  fromObject,
  fromJsonString,
} from './declaration/generate.js';
import {
  INDENT,
  sanitizePropertyName,
  toPascalCase,
  isRecordType,
  config as propertiesConfig,
} from './declaration/properties.js';
import {
  normalizeSchemaDir,
  getSchemaPath,
  loadCollectionSchema,
} from './schema/loader.js';
import { validateData } from './validation/validate.js';

export {
  generateDeclaration,
  fromObject,
  fromJsonString,
  validateData,
  sanitizePropertyName,
  toPascalCase,
  isRecordType,
  normalizeSchemaDir,
};

export * from './errors.js';

/**
 * Static-class facade. Mutating `Generator.CHEX_SCHEMA_DIR` after import is
 * supported and takes effect on the next `validateData` call.
 */
export default class Generator {
  static INDENT = INDENT;

  /** @type {string|null|undefined} */
  static CHEX_SCHEMA_DIR =
    typeof window !== 'undefined' ? '.' : process.env.CHEX_SCHEMA_DIR;

  /** @type {Map<string, Record<string, unknown>>} */
  static collectionSchemas = new Map();

  static get allowedSpecialCharacters() { return propertiesConfig.allowedSpecialCharacters; }
  static set allowedSpecialCharacters(chars) { propertiesConfig.allowedSpecialCharacters = chars; }

  static normalizeSchemaDir = normalizeSchemaDir;
  static sanitizePropertyName = sanitizePropertyName;
  static toPascalCase = toPascalCase;
  static isRecordType = isRecordType;
  static generateDeclaration = generateDeclaration;
  static fromObject = fromObject;
  static fromJsonString = fromJsonString;

  static getSchemaPath(collection) {
    return getSchemaPath(collection, this.CHEX_SCHEMA_DIR);
  }

  static loadCollectionSchema(collection) {
    return loadCollectionSchema(collection, this.CHEX_SCHEMA_DIR);
  }

  static validateData(collection, data) {
    return validateData(collection, data, {
      schemaDir: this.CHEX_SCHEMA_DIR,
      cache: this.collectionSchemas,
    });
  }
}
