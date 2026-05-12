/**
 * @fileoverview Typed error classes for CHEX.
 *
 * Callers can `catch` by class instead of substring-matching messages:
 *
 *   import { ValidationError, SchemaLoadError } from '@d31ma/chex';
 *
 *   try { await Gen.validateData('user', input); }
 *   catch (err) {
 *     if (err instanceof ValidationError) { ... }
 *     else if (err instanceof SchemaLoadError) { ... }
 *   }
 */

export class ChexError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Configuration is missing or invalid (e.g. CHEX_SCHEMA_DIR not set). */
export class ConfigError extends ChexError {}

/** Caller passed an input shape CHEX cannot accept. */
export class InvalidInputError extends ChexError {}

/** Caller passed a name that fails the identifier or path-safety regex. */
export class InvalidNameError extends ChexError {}

/** A schema file could not be loaded or parsed. */
export class SchemaLoadError extends ChexError {}

/** Data did not satisfy a schema constraint. */
export class ValidationError extends ChexError {}
