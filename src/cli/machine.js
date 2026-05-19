import { validateData } from '../index.js';

const MACHINE_PROTOCOL_VERSION = 1;

/**
 * @typedef {'validate'} MachineOperation
 */

/**
 * @typedef {object} MachineRequest
 * @property {MachineOperation} op
 * @property {string=} requestId
 * @property {string=} schema
 * @property {string=} schemaPath
 * @property {string=} schemaDir
 * @property {string=} collection
 * @property {Record<string, any>=} data
 */

/**
 * @typedef {object} MachineSuccessResponse
 * @property {number} protocolVersion
 * @property {true} ok
 * @property {MachineOperation} op
 * @property {string | null} requestId
 * @property {number} durationMs
 * @property {unknown} result
 */

/**
 * @typedef {object} MachineErrorResponse
 * @property {number} protocolVersion
 * @property {false} ok
 * @property {MachineOperation | null} op
 * @property {string | null} requestId
 * @property {number} durationMs
 * @property {{ name: string, message: string }} error
 */

export class JsonRecord {
  /**
   * @param {unknown} value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * @returns {this is { value: Record<string, any> }}
   */
  isObject() {
    return typeof this.value === 'object' && this.value !== null && !Array.isArray(this.value);
  }

  /**
   * @returns {Record<string, any>}
   */
  requireObject() {
    if (!this.isObject()) throw new Error('Machine request body must be a JSON object');
    return this.value;
  }
}

export class MachineRequestEnvelope {
  /**
   * @param {unknown} value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * @returns {MachineRequest}
   */
  requireRequest() {
    const request = new JsonRecord(this.value).requireObject();
    if (typeof request.op !== 'string') {
      throw new Error('Machine request field "op" must be a string');
    }
    return /** @type {MachineRequest} */ (request);
  }

  /**
   * @param {keyof MachineRequest} field
   * @returns {string}
   */
  requireString(field) {
    const request = this.requireRequest();
    const value = request[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Machine request field "${String(field)}" must be a non-empty string`);
    }
    return value;
  }

  /**
   * @param {keyof MachineRequest} field
   * @returns {Record<string, any>}
   */
  requireObject(field) {
    const request = this.requireRequest();
    const value = request[field];
    if (!new JsonRecord(value).isObject()) {
      throw new Error(`Machine request field "${String(field)}" must be an object`);
    }
    return value;
  }
}

export class MachineOperationExecutor {
  /**
   * @param {unknown} request
   */
  constructor(request) {
    this.envelope = new MachineRequestEnvelope(request);
  }

  /**
   * @returns {Promise<unknown>}
   */
  async execute() {
    const request = this.envelope.requireRequest();
    switch (request.op) {
      case 'validate':
        return await validateData(
          this.schemaRef(),
          this.envelope.requireObject('data'),
          {
            schemaPath: request.schemaPath,
            schemaDir: request.schemaDir,
          }
        );
      default:
        throw new Error(`Unsupported machine operation "${request.op}"`);
    }
  }

  /**
   * @returns {string}
   */
  schemaRef() {
    const request = this.envelope.requireRequest();
    if (typeof request.schemaPath === 'string' && request.schemaPath.trim().length > 0) {
      return request.schemaPath;
    }
    if (typeof request.schema === 'string' && request.schema.trim().length > 0) {
      return request.schema;
    }
    return this.envelope.requireString('collection');
  }
}

/**
 * @param {MachineRequest} request
 * @returns {Promise<unknown>}
 */
export const executeMachineOperation = async (request) => {
  return await new MachineOperationExecutor(request).execute();
};

export class MachineResponseFactory {
  /**
   * @param {unknown} request
   * @param {number} startedAt
   */
  constructor(request, startedAt) {
    this.request = request;
    this.startedAt = startedAt;
  }

  /**
   * @returns {MachineOperation | null}
   */
  get op() {
    if (new JsonRecord(this.request).isObject() && this.request.op === 'validate') {
      return this.request.op;
    }
    return null;
  }

  /**
   * @returns {string | null}
   */
  get requestId() {
    if (new JsonRecord(this.request).isObject() && typeof this.request.requestId === 'string') {
      return this.request.requestId;
    }
    return null;
  }

  get durationMs() {
    return Date.now() - this.startedAt;
  }

  /**
   * @param {unknown} result
   * @returns {MachineSuccessResponse}
   */
  success(result) {
    return {
      protocolVersion: MACHINE_PROTOCOL_VERSION,
      ok: true,
      op: this.op ?? 'validate',
      requestId: this.requestId,
      durationMs: this.durationMs,
      result,
    };
  }

  /**
   * @param {unknown} error
   * @returns {MachineErrorResponse}
   */
  error(error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      protocolVersion: MACHINE_PROTOCOL_VERSION,
      ok: false,
      op: this.op,
      requestId: this.requestId,
      durationMs: this.durationMs,
      error: {
        name: err.name,
        message: err.message,
      },
    };
  }
}

export const machineSuccessResponse = (request, startedAt, result) => {
  return new MachineResponseFactory(request, startedAt).success(result);
};

export const machineErrorResponse = (request, startedAt, error) => {
  return new MachineResponseFactory(request, startedAt).error(error);
};
