/**
 * @fileoverview Schema-shape helpers shared by validation and CLI code.
 */

export class SchemaKey {
  /**
   * @param {string} value
   */
  constructor(value) {
    this.value = value;
  }

  get dataKey() {
    return this.isNullable ? this.value.slice(0, -1) : this.value;
  }

  get displayName() {
    return this.dataKey;
  }

  get isNullable() {
    return this.value.endsWith('?');
  }
}

export class SchemaShape {
  /**
   * @param {Record<string, unknown>} value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * An object is a Record descriptor if it has exactly one entry whose key starts
   * with `^`, indicating the key is a regex pattern rather than a property name.
   * Format: `{ "^keyRegex$": "^valueRegex$" }`
   *
   * @returns {boolean}
   */
  isRecordType() {
    const keys = Object.keys(this.value);
    return keys.length === 1 && keys[0].startsWith('^');
  }

  /**
   * @param {string} key
   * @returns {string}
   */
  static displayPropertyName(key) {
    return new SchemaKey(key).displayName;
  }

  /**
   * @param {Record<string, unknown>} obj
   * @returns {boolean}
   */
  static isRecordType(obj) {
    return new SchemaShape(obj).isRecordType();
  }
}

export const displayPropertyName = SchemaShape.displayPropertyName;
export const isRecordType = SchemaShape.isRecordType;
