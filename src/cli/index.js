#!/usr/bin/env bun
import path from 'node:path';
import {
  executeMachineOperation,
  machineErrorResponse,
  machineSuccessResponse,
} from './machine.js';

const HELP = `chex — regex-driven JSON schema validation

Usage:
  chex validate <schema|schema-path> <json|@path|-> [--schema-dir <path>]
  chex exec --request <json|@path|->

Options:
  --schema-dir <path>  Resolve the schema argument as <path>/<schema>.schema.json
  --request <value>    Machine request payload, @file path, or - for stdin
  -h, --help           Show this help and exit

Machine request:
  {"op":"validate","schemaPath":"./schemas/person.schema.json","data":{...}}

All commands write structured JSON to stdout.`;

/**
 * @typedef {object} ParsedArgs
 * @property {string[]} positionals
 * @property {string | undefined} schemaDir
 * @property {string | undefined} request
 * @property {boolean} help
 */

class CliArgsParser {
  /**
   * @param {string[]} argv
   */
  constructor(argv) {
    this.argv = argv;
  }

  /**
   * @returns {ParsedArgs}
   */
  parse() {
    const positionals = [];
    let schemaDir;
    let request;
    let help = false;

    for (let index = 0; index < this.argv.length; index++) {
      const arg = this.argv[index];
      if (arg === '--schema-dir') {
        const value = this.argv[index + 1];
        if (!value) throw new Error('Missing value for --schema-dir');
        schemaDir = path.resolve(value);
        index++;
        continue;
      }
      if (arg === '--request') {
        const value = this.argv[index + 1];
        if (!value) throw new Error('Missing value for --request');
        request = value;
        index++;
        continue;
      }
      if (arg === '--help' || arg === '-h') {
        help = true;
        continue;
      }
      positionals.push(arg);
    }

    return { positionals, schemaDir, request, help };
  }
}

class JsonSourceLoader {
  /**
   * @param {string} source
   */
  constructor(source) {
    this.source = source;
  }

  /**
   * @returns {Promise<string>}
   */
  async text() {
    if (this.source === '-') {
      if (process.stdin.isTTY) throw new Error('JSON input requires <json|@path|->');
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      return Buffer.concat(chunks).toString('utf8');
    }

    if (this.source.startsWith('@')) {
      return await Bun.file(this.source.slice(1)).text();
    }

    return this.source;
  }

  /**
   * @returns {Promise<unknown>}
   */
  async json() {
    const text = await this.text();
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error(`Invalid JSON input: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

class JsonOutput {
  /**
   * @param {unknown} value
   */
  write(value) {
    console.log(JSON.stringify(value, null, 2));
  }
}

class MachineRequestBuilder {
  /**
   * @param {ParsedArgs} args
   */
  constructor(args) {
    this.args = args;
  }

  /**
   * @returns {Promise<unknown>}
   */
  async build() {
    const [command, schema, dataSource] = this.args.positionals;

    if (command === 'exec') {
      if (!this.args.request) throw new Error('Missing --request for exec');
      return await new JsonSourceLoader(this.args.request).json();
    }

    if (command === 'validate') {
      if (!schema) throw new Error('Missing schema for validate');
      if (!dataSource) throw new Error('Missing JSON data input for validate');
      const data = await new JsonSourceLoader(dataSource).json();
      const usesSchemaPath = !this.args.schemaDir && /[\\/]|\.schema\.json$/i.test(schema);
      return {
        op: 'validate',
        schemaDir: this.args.schemaDir,
        ...(usesSchemaPath ? { schemaPath: schema } : { schema }),
        data,
      };
    }

    throw new Error(`Unsupported command "${command ?? ''}"`);
  }
}

class ChexCliApp {
  /**
   * @param {string[]} argv
   */
  constructor(argv) {
    this.argv = argv;
    this.request = undefined;
    this.startedAt = Date.now();
    this.output = new JsonOutput();
  }

  /**
   * @returns {Promise<void>}
   */
  async run() {
    try {
      const args = new CliArgsParser(this.argv).parse();
      if (args.help || args.positionals.length === 0) {
        console.log(HELP);
        process.exit(args.help ? 0 : 1);
      }

      this.request = await new MachineRequestBuilder(args).build();
      const result = await executeMachineOperation(this.request);
      this.output.write(machineSuccessResponse(this.request, this.startedAt, result));
      process.exit(0);
    } catch (error) {
      this.output.write(machineErrorResponse(this.request, this.startedAt, error));
      process.exit(1);
    }
  }
}

await new ChexCliApp(process.argv.slice(2)).run();
