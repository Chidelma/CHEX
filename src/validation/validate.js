/**
 * @fileoverview Runtime validation of data against a CHEX schema.
 *
 * All leaf values in CHEX schemas are regex pattern strings. Data values
 * are coerced to strings and tested against the pattern. The `?` suffix
 * on schema keys marks nullable fields.
 */

import { SchemaKey, isRecordType } from '../schema/shape.js';
import { loadSchema } from '../schema/loader.js';
import { InvalidInputError, InvalidNameError, ValidationError } from '../errors.js';

const MAX_REGEX_LENGTH = 500;
const MESSAGE_TRUNCATE_AT = 100;

class ValidationMessage {
  /**
   * @param {string} value
   * @param {number} [limit]
   * @returns {string}
   */
  static truncate(value, limit = MESSAGE_TRUNCATE_AT) {
    return value.length > limit ? value.slice(0, limit) + '...' : value;
  }
}

class RegexConstraint {
  /**
   * @param {string} pattern
   * @param {string} fullPath
   * @param {string} schemaLabel
   */
  constructor(pattern, fullPath, schemaLabel) {
    this.pattern = pattern;
    this.fullPath = fullPath;
    this.schemaLabel = schemaLabel;
  }

  /**
   * @returns {RegExp}
   */
  compile() {
    if (this.pattern.length > MAX_REGEX_LENGTH) {
      throw new ValidationError(
        `Regex pattern for '${ValidationMessage.truncate(this.fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' exceeds maximum allowed length`
      );
    }
    try {
      return new RegExp(this.pattern);
    } catch {
      throw new ValidationError(
        `Invalid RegEx pattern for '${ValidationMessage.truncate(this.fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}'`
      );
    }
  }

  /**
   * @param {unknown} value
   */
  validate(value) {
    if (!this.compile().test(String(value))) {
      throw new ValidationError(
        `RegEx pattern fails for property '${ValidationMessage.truncate(this.fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}'`
      );
    }
  }
}

class SchemaPattern {
  /**
   * @param {unknown} value
   * @param {string} fullPath
   * @param {string} schemaLabel
   */
  constructor(value, fullPath, schemaLabel) {
    this.value = value;
    this.fullPath = fullPath;
    this.schemaLabel = schemaLabel;
  }

  /**
   * @returns {string}
   */
  requireRegexString() {
    if (typeof this.value !== 'string') {
      throw new InvalidInputError(
        `Schema value for '${ValidationMessage.truncate(this.fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' must be a regex string`
      );
    }
    if (this.value.length === 0) {
      throw new InvalidInputError(
        `Schema pattern for '${ValidationMessage.truncate(this.fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' cannot be empty`
      );
    }
    new RegexConstraint(this.value, this.fullPath, this.schemaLabel).compile();
    return this.value;
  }
}

class SchemaDefinitionValidator {
  /**
   * @param {string} schemaLabel
   * @param {unknown} schema
   * @param {string} [path]
   */
  constructor(schemaLabel, schema, path) {
    this.schemaLabel = schemaLabel;
    this.schema = schema;
    this.path = path;
  }

  /**
   * @returns {Record<string, unknown>}
   */
  requireObjectSchema() {
    if (typeof this.schema !== 'object' || this.schema === null || Array.isArray(this.schema)) {
      throw new InvalidInputError(
        `Schema '${ValidationMessage.truncate(this.schemaLabel)}' must be a JSON object`
      );
    }

    const schema = /** @type {Record<string, unknown>} */ (this.schema);
    if (Object.keys(schema).length === 0) {
      const location = this.path ? ` at '${ValidationMessage.truncate(this.path)}'` : '';
      throw new InvalidInputError(
        `Schema '${ValidationMessage.truncate(this.schemaLabel)}'${location} must define at least one property`
      );
    }

    return schema;
  }

  /**
   * @param {string} schemaKey
   * @returns {string}
   */
  fullPathFor(schemaKey) {
    const displayKey = new SchemaKey(schemaKey).displayName;
    return this.path ? `${this.path}.${displayKey}` : displayKey;
  }

  /**
   * @param {unknown[]} schemaValue
   * @param {string} fullPath
   */
  validateArray(schemaValue, fullPath) {
    if (schemaValue.length !== 1) {
      throw new InvalidInputError(
        `Array schema for '${ValidationMessage.truncate(fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' must contain exactly one regex string or object schema`
      );
    }

    const itemSchema = schemaValue[0];
    if (typeof itemSchema === 'string') {
      new SchemaPattern(itemSchema, fullPath, this.schemaLabel).requireRegexString();
      return;
    }

    if (typeof itemSchema === 'object' && itemSchema !== null && !Array.isArray(itemSchema)) {
      new SchemaDefinitionValidator(
        this.schemaLabel,
        itemSchema,
        `${fullPath}[]`
      ).validate();
      return;
    }

    throw new InvalidInputError(
      `Array schema for '${ValidationMessage.truncate(fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' must contain exactly one regex string or object schema`
    );
  }

  /**
   * @param {Record<string, unknown>} schemaValue
   * @param {string} fullPath
   */
  validateObject(schemaValue, fullPath) {
    if (Object.keys(schemaValue).length === 0) {
      throw new InvalidInputError(
        `Schema '${ValidationMessage.truncate(this.schemaLabel)}' at '${ValidationMessage.truncate(fullPath)}' must define at least one property`
      );
    }

    if (isRecordType(schemaValue)) {
      const keyPattern = Object.keys(schemaValue)[0];
      new SchemaPattern(keyPattern, `${fullPath}.<key>`, this.schemaLabel).requireRegexString();
      new SchemaPattern(schemaValue[keyPattern], fullPath, this.schemaLabel).requireRegexString();
      return;
    }

    new SchemaDefinitionValidator(this.schemaLabel, schemaValue, fullPath).validate();
  }

  validate() {
    const schema = this.requireObjectSchema();
    for (const schemaKey in schema) {
      const schemaValue = schema[schemaKey];
      const fullPath = this.fullPathFor(schemaKey);

      if (typeof schemaValue === 'string') {
        new SchemaPattern(schemaValue, fullPath, this.schemaLabel).requireRegexString();
        continue;
      }

      if (Array.isArray(schemaValue)) {
        this.validateArray(schemaValue, fullPath);
        continue;
      }

      if (typeof schemaValue === 'object' && schemaValue !== null) {
        this.validateObject(/** @type {Record<string, unknown>} */ (schemaValue), fullPath);
        continue;
      }

      throw new InvalidInputError(
        `Schema value for '${ValidationMessage.truncate(fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}' must be a regex string`
      );
    }
    return schema;
  }
}

class SchemaObjectValidator {
  /**
   * @param {string} schemaLabel
   * @param {Record<string, unknown>} schema
   * @param {string} [path]
   */
  constructor(schemaLabel, schema, path) {
    this.schemaLabel = schemaLabel;
    this.schema = schema;
    this.path = path;
  }

  /**
   * @param {unknown} dataValue
   * @param {string} pattern
   * @param {string} fullPath
   */
  validateLeaf(dataValue, pattern, fullPath) {
    new RegexConstraint(pattern, fullPath, this.schemaLabel).validate(dataValue);
  }

  /**
   * @param {string} fullPath
   */
  rejectMissing(fullPath) {
    throw new ValidationError(
      `Property '${ValidationMessage.truncate(fullPath)}' cannot be null or undefined in schema '${ValidationMessage.truncate(this.schemaLabel)}'`
    );
  }

  /**
   * @param {string} fullPath
   * @param {'array'|'object'} expected
   */
  rejectTypeMismatch(fullPath, expected) {
    throw new ValidationError(
      `Type mismatch for '${ValidationMessage.truncate(fullPath)}' in schema '${ValidationMessage.truncate(this.schemaLabel)}': expected an ${expected}`
    );
  }

  /**
   * @param {Record<string, unknown>} data
   */
  rejectUnknownProperties(data) {
    // Schema keys may carry a trailing `?` for nullability; data keys never do.
    for (const dataKey in data) {
      if (dataKey in this.schema || `${dataKey}?` in this.schema) continue;
      throw new ValidationError(
        `Property '${ValidationMessage.truncate(dataKey)}' does not exist in schema '${ValidationMessage.truncate(this.schemaLabel)}'`
      );
    }
  }

  /**
   * @param {Record<string, unknown>} data
   * @param {string} schemaKey
   */
  validateProperty(data, schemaKey) {
    const schemaValue = this.schema[schemaKey];
    const key = new SchemaKey(schemaKey);
    const dataKey = key.dataKey;
    const displayKey = key.displayName;
    const dataValue = data[dataKey];
    const fullPath = this.path ? `${this.path}.${displayKey}` : displayKey;
    const valueIsDefined = dataValue !== null && dataValue !== undefined;

    if (typeof schemaValue === 'string') {
      if (!valueIsDefined && key.isNullable) return;
      if (!valueIsDefined) this.rejectMissing(fullPath);
      this.validateLeaf(dataValue, schemaValue, fullPath);
      return;
    }

    if (Array.isArray(schemaValue)) {
      if (!valueIsDefined && key.isNullable) return;
      if (!valueIsDefined) this.rejectMissing(fullPath);
      if (!Array.isArray(dataValue)) this.rejectTypeMismatch(fullPath, 'array');
      const itemSchema = schemaValue[0];
      if (typeof itemSchema === 'string') {
        for (const item of dataValue) {
          this.validateLeaf(item, itemSchema, fullPath);
        }
      } else if (typeof itemSchema === 'object' && itemSchema !== null && !Array.isArray(itemSchema)) {
        for (const [index, item] of dataValue.entries()) {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            this.rejectTypeMismatch(`${fullPath}[${index}]`, 'object');
          }
          new SchemaObjectValidator(
            this.schemaLabel,
            /** @type {Record<string, unknown>} */ (itemSchema),
            `${fullPath}[${index}]`
          ).validate(/** @type {Record<string, unknown>} */ (item));
        }
      }
      return;
    }

    if (typeof schemaValue === 'object' && schemaValue !== null) {
      if (!valueIsDefined && key.isNullable) return;
      if (!valueIsDefined) this.rejectMissing(fullPath);
      if (typeof dataValue !== 'object' || dataValue === null || Array.isArray(dataValue)) {
        this.rejectTypeMismatch(fullPath, 'object');
      }

      if (isRecordType(schemaValue)) {
        const keyPattern = Object.keys(schemaValue)[0];
        const valuePattern = schemaValue[keyPattern];
        if (typeof valuePattern === 'string') {
          for (const [k, v] of Object.entries(dataValue)) {
            this.validateLeaf(k, keyPattern, `${fullPath}.<key:${k}>`);
            this.validateLeaf(v, valuePattern, `${fullPath}.${k}`);
          }
        }
      } else {
        new SchemaObjectValidator(
          this.schemaLabel,
          /** @type {Record<string, unknown>} */ (schemaValue),
          fullPath
        ).validate(/** @type {Record<string, unknown>} */ (dataValue));
      }
    }
  }

  /**
   * Validate `data` against this schema recursively.
   * @param {Record<string, unknown>} data
   * @returns {Record<string, unknown>}
   */
  validate(data) {
    this.rejectUnknownProperties(data);
    for (const schemaKey in this.schema) {
      this.validateProperty(data, schemaKey);
    }
    return data;
  }
}

/**
 * Validate a data object against a schema. `schemaRef` is treated as an exact
 * schema path unless `schemaDir` is explicitly provided.
 *
 * @template {Record<string, unknown>} T
 * @param {string} schemaRef
 * @param {T} data
 * @param {{ schemaPath?: string|null, schemaDir?: string|null, cache?: Map<string, Record<string, unknown>> }} [options]
 * @returns {Promise<T>}
 */
const defaultCache = new Map();

export class SchemaValidator {
  /**
   * @param {{ schemaPath?: string|null, schemaDir?: string|null, cache?: Map<string, Record<string, unknown>> }} [options]
   */
  constructor(options = {}) {
    this.schemaPath = options.schemaPath;
    this.schemaDir = options.schemaDir;
    this.cache = options.cache ?? defaultCache;
  }

  /**
   * @param {string} schemaName
   */
  assertSchemaName(schemaName) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(schemaName) || schemaName.includes('..')) {
      throw new InvalidNameError('Invalid schema name');
    }
  }

  /**
   * @param {string} schemaRef
   * @returns {{ schemaPath?: string|null, schemaName?: string|null, schemaDir?: string|null, label: string, cacheKey: string }}
   */
  sourceFor(schemaRef) {
    if (this.schemaPath) {
      return {
        schemaPath: this.schemaPath,
        label: this.schemaPath,
        cacheKey: `path:${this.schemaPath}`,
      };
    }

    if (/[\\/]|\.schema\.json$/i.test(schemaRef)) {
      return {
        schemaPath: schemaRef,
        label: schemaRef,
        cacheKey: `path:${schemaRef}`,
      };
    }

    if (this.schemaDir) {
      this.assertSchemaName(schemaRef);
      return {
        schemaName: schemaRef,
        schemaDir: this.schemaDir,
        label: schemaRef,
        cacheKey: `dir:${this.schemaDir}:${schemaRef}`,
      };
    }

    return {
      schemaPath: schemaRef,
      label: schemaRef,
      cacheKey: `path:${schemaRef}`,
    };
  }

  /**
   * @param {string} schemaRef
   * @returns {Promise<Record<string, unknown>>}
   */
  async schemaFor(schemaRef) {
    const source = this.sourceFor(schemaRef);
    let schema = this.cache.get(source.cacheKey);
    if (!schema) {
      schema = await loadSchema(source);
      new SchemaDefinitionValidator(source.label, schema).validate();
      this.cache.set(source.cacheKey, schema);
    }
    return schema;
  }

  /**
   * @template {Record<string, unknown>} T
   * @param {string} schemaRef
   * @param {T} data
   * @returns {Promise<T>}
   */
  async validate(schemaRef, data) {
    const source = this.sourceFor(schemaRef);
    let schema = this.cache.get(source.cacheKey);
    if (!schema) {
      schema = await loadSchema(source);
      new SchemaDefinitionValidator(source.label, schema).validate();
      this.cache.set(source.cacheKey, schema);
    }
    return /** @type {T} */ (new SchemaObjectValidator(source.label, schema).validate(data));
  }
}

export class CollectionValidator extends SchemaValidator {}

export const validateData = async (schemaRef, data, options = {}) => {
  return await new SchemaValidator(options).validate(schemaRef, data);
};
