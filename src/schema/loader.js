/**
 * @fileoverview Schema directory resolution and JSON loading.
 */

import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaLoadError } from '../errors.js';

export class SchemaLocation {
  /**
   * @param {string|undefined|null} path
   * @param {{ requireJsonFile?: boolean }} [options]
   */
  constructor(path, options = {}) {
    if (!path) {
      throw new ConfigError('A schema path is required');
    }
    this.path = path;
    this.requireJsonFile = options.requireJsonFile ?? true;
  }

  /**
   * @returns {string}
   */
  normalized() {
    let normalized = this.path;
    if (this.path.startsWith('file:')) {
      normalized = fileURLToPath(this.path);
    } else if (/^\/[A-Za-z]:\//.test(this.path)) {
      normalized = this.path.slice(1);
    }
    if (this.requireJsonFile && !normalized.toLowerCase().endsWith('.schema.json')) {
      throw new ConfigError('Schema path must point to a .schema.json file');
    }
    return normalized;
  }
}

export class SchemaDirectory {
  /**
   * @param {string|undefined|null} value
   */
  constructor(value) {
    if (!value) {
      throw new ConfigError('A schema directory is required for name-based lookup');
    }
    this.location = new SchemaLocation(value, { requireJsonFile: false });
  }

  normalized() {
    return this.location.normalized();
  }

  pathFor(schemaName) {
    const normalized = this.normalized().replace(/[\\/]+$/, '');
    return `${normalized}/${schemaName}.schema.json`;
  }
}

export class SchemaSource {
  /**
   * @param {{ schemaPath?: string|null, schemaName?: string|null, schemaDir?: string|null }} options
   */
  constructor(options = {}) {
    this.schemaPath = options.schemaPath;
    this.schemaName = options.schemaName;
    this.schemaDir = options.schemaDir;
  }

  /**
   * @returns {string}
   */
  path() {
    if (this.schemaPath) {
      return new SchemaLocation(this.schemaPath).normalized();
    }
    return new SchemaDirectory(this.schemaDir).pathFor(this.schemaName);
  }
}

export class SchemaLoader {
  /**
   * @param {{ schemaPath?: string|null, schemaName?: string|null, schemaDir?: string|null }} options
   */
  constructor(options = {}) {
    this.source = new SchemaSource(options);
  }

  /**
   * @returns {string}
   */
  getSchemaPath() {
    return this.source.path();
  }

  /**
   * @returns {Promise<Record<string, unknown>>}
   */
  async load() {
    const schemaPath = this.getSchemaPath();

    try {
      if (typeof Bun !== 'undefined' && typeof window === 'undefined') {
        const text = await Bun.file(schemaPath).text();
        return new SchemaJsonDocument(text, schemaPath).parse();
      }
      const res = await import(schemaPath);
      return res.default;
    } catch (cause) {
      if (cause instanceof ConfigError || cause instanceof SchemaLoadError) {
        throw cause;
      }
      throw new SchemaLoadError(`Failed to load schema from '${schemaPath}'`, { cause });
    }
  }
}

export class SchemaJsonDocument {
  /**
   * @param {string} text
   * @param {string} schemaPath
   */
  constructor(text, schemaPath) {
    this.text = text;
    this.schemaPath = schemaPath;
  }

  assertNotJsonLines() {
    const lines = this.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 1 && lines.every((line) => line.startsWith('{') && line.endsWith('}'))) {
      throw new SchemaLoadError(`Schema files must contain one JSON object, not JSONL: '${this.schemaPath}'`);
    }
  }

  parse() {
    this.assertNotJsonLines();
    try {
      return JSON.parse(this.text);
    } catch (cause) {
      throw new SchemaLoadError(`Failed to load schema from '${this.schemaPath}'`, { cause });
    }
  }
}

/**
 * Normalize a schema directory path so callers may pass file:// URLs or
 * the leading-slash Windows form returned by URL APIs.
 * @param {string} schemaDir
 * @returns {string}
 */
export const normalizeSchemaDir = (schemaDir) => {
  return new SchemaDirectory(schemaDir).normalized();
};

export const normalizeSchemaPath = (schemaPath) => {
  return new SchemaLocation(schemaPath).normalized();
};

/**
 * Build the full path to a named CHEX schema file.
 * @param {string} schemaName
 * @param {string|undefined|null} schemaDir
 * @returns {string}
 */
export const getSchemaPath = (schemaName, schemaDir) => {
  return new SchemaLoader({ schemaName, schemaDir }).getSchemaPath();
};

/**
 * Load a schema as a plain object.
 * @param {{ schemaPath?: string|null, schemaName?: string|null, schemaDir?: string|null }} options
 * @returns {Promise<Record<string, unknown>>}
 */
export const loadSchema = async (options = {}) => {
  return await new SchemaLoader(options).load();
};

export const loadCollectionSchema = async (collection, schemaDir) => {
  return await loadSchema({ schemaName: collection, schemaDir });
};
