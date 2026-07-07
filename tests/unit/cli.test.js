import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  executeMachineOperation,
  machineErrorResponse,
  machineSuccessResponse,
  serveStdioLoop,
} from '../../src/cli/machine.js';

const repo = process.cwd();
const schemaDir = path.join(repo, 'examples', 'valid');
const measureSchemaPath = path.join(schemaDir, 'measure.schema.json');

describe('serveStdioLoop', () => {
  it('answers NDJSON requests in order, one response per line', async () => {
    const input = [
      `${JSON.stringify({ requestId: 'ok', op: 'validate', schemaPath: measureSchemaPath, data: { score: '100', temperature: '25', quantity: '10', username: 'alice', code: 'AB12' } })}\n`,
      `${JSON.stringify({ requestId: 'bad', op: 'validate', schemaPath: measureSchemaPath, data: { score: 'nope' } })}\n`,
      'not json\n',
    ];
    let out = '';
    await serveStdioLoop({ input, write: (line) => (out += line) });

    const lines = out.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ ok: true, requestId: 'ok' });
    expect(lines[1]).toMatchObject({ ok: false, requestId: 'bad' });
    expect(lines[2].ok).toBe(false); // invalid JSON line still yields an error envelope
  });
});

describe('machine interface', () => {
  it('executes validation requests', async () => {
    const request = {
      requestId: 'validate-1',
      op: 'validate',
      schemaPath: measureSchemaPath,
      data: {
        score: '100',
        temperature: '25',
        quantity: '10',
        username: 'alice',
        code: 'AB12',
      },
    };

    const result = await executeMachineOperation(request);
    const payload = machineSuccessResponse(request, Date.now(), result);

    expect(payload.ok).toBe(true);
    expect(payload.protocolVersion).toBe(1);
    expect(payload.op).toBe('validate');
    expect(payload.requestId).toBe('validate-1');
    expect(payload.result.score).toBe('100');
  });

  it('executes validation requests by schema name and directory', async () => {
    const request = {
      requestId: 'validate-by-name',
      op: 'validate',
      schema: 'measure',
      schemaDir,
      data: {
        score: '100',
        temperature: '25',
        quantity: '10',
        username: 'alice',
        code: 'AB12',
      },
    };

    const result = await executeMachineOperation(request);

    expect(result.score).toBe('100');
  });

  it('returns structured validation errors', async () => {
    const request = {
      requestId: 'bad-validate',
      op: 'validate',
      schemaPath: path.join(schemaDir, 'status.schema.json'),
      data: {
        direction: 'northwest',
        priority: '2',
        label: 'active',
        tag: null,
      },
    };

    let error;
    try {
      await executeMachineOperation(request);
    } catch (caught) {
      error = caught;
    }

    const payload = machineErrorResponse(request, Date.now(), error);
    expect(payload.ok).toBe(false);
    expect(payload.requestId).toBe('bad-validate');
    expect(payload.error.name).toBe('ValidationError');
    expect(payload.error.message).toContain("RegEx pattern fails for property 'direction'");
  });

  it('rejects unsupported operations through the machine interface', async () => {
    await expect(
      executeMachineOperation({
        op: 'unknownOperation',
      })
    ).rejects.toThrow('Unsupported machine operation "unknownOperation"');
  });
});
