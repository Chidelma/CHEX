import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateData } from '../../src/index.js';
import { validate as webValidate, CHEXError } from '../../clients/web/chex.mjs';

// The web shim reimplements CHEX validation in the browser (no binary). This
// test keeps it in lockstep with the real engine: for each case, the shim must
// accept/reject exactly what `validateData` does against the same schema.

const dir = mkdtempSync(path.join(tmpdir(), 'chex-web-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let counter = 0;
const schemaFile = (schema) => {
  const file = path.join(dir, `s${counter++}.schema.json`);
  writeFileSync(file, JSON.stringify(schema));
  return file;
};

/** @type {Array<{ name: string, schema: any, data: any, valid: boolean }>} */
const cases = [
  { name: 'primitive pass', schema: { age: '^[0-9]+$' }, data: { age: 30 }, valid: true },
  { name: 'primitive fail', schema: { age: '^[0-9]+$' }, data: { age: 'x' }, valid: false },
  { name: 'boolean coercion', schema: { active: '^(true|false)$' }, data: { active: true }, valid: true },
  { name: 'nullable absent', schema: { 'nickname?': '^[a-z]+$' }, data: {}, valid: true },
  { name: 'nullable present ok', schema: { 'nickname?': '^[a-z]+$' }, data: { nickname: 'ada' }, valid: true },
  { name: 'nullable present bad', schema: { 'nickname?': '^[a-z]+$' }, data: { nickname: 'A1' }, valid: false },
  { name: 'missing required', schema: { age: '^[0-9]+$' }, data: {}, valid: false },
  { name: 'unknown property', schema: { age: '^[0-9]+$' }, data: { age: 1, extra: 'x' }, valid: false },
  { name: 'nested object ok', schema: { addr: { city: '^[A-Za-z]+$' } }, data: { addr: { city: 'Lagos' } }, valid: true },
  { name: 'nested object bad', schema: { addr: { city: '^[A-Za-z]+$' } }, data: { addr: { city: 'L4' } }, valid: false },
  { name: 'object type mismatch', schema: { addr: { city: '^[A-Za-z]+$' } }, data: { addr: 'x' }, valid: false },
  { name: 'scalar array ok', schema: { tags: ['^[a-z]+$'] }, data: { tags: ['bun', 'web'] }, valid: true },
  { name: 'scalar array bad', schema: { tags: ['^[a-z]+$'] }, data: { tags: ['bun', 'W1'] }, valid: false },
  { name: 'array type mismatch', schema: { tags: ['^[a-z]+$'] }, data: { tags: 'nope' }, valid: false },
  {
    name: 'array of objects ok',
    schema: { items: [{ sku: '^[A-Z0-9-]+$', 'gift?': '^(true|false)$' }] },
    data: { items: [{ sku: 'AB-1' }, { sku: 'CD-2', gift: true }] },
    valid: true,
  },
  {
    name: 'array of objects bad',
    schema: { items: [{ sku: '^[A-Z0-9-]+$' }] },
    data: { items: [{ sku: 'ab-1' }] },
    valid: false,
  },
  { name: 'record ok', schema: { meta: { '^[a-z_]+$': '^.+$' } }, data: { meta: { a_b: 'x' } }, valid: true },
  { name: 'record bad key', schema: { meta: { '^[a-z_]+$': '^.+$' } }, data: { meta: { A: 'x' } }, valid: false },
  { name: 'record bad value', schema: { meta: { '^[a-z]+$': '^[0-9]+$' } }, data: { meta: { a: 'x' } }, valid: false },
];

const engineAccepts = async (schema, data) => {
  try {
    await validateData(schemaFile(schema), data);
    return true;
  } catch {
    return false;
  }
};

const webAccepts = (schema, data) => {
  try {
    webValidate(schema, data);
    return true;
  } catch {
    return false;
  }
};

describe('web client parity with the engine', () => {
  for (const testCase of cases) {
    it(`${testCase.name} → ${testCase.valid ? 'valid' : 'invalid'}`, async () => {
      const engine = await engineAccepts(testCase.schema, testCase.data);
      const web = webAccepts(testCase.schema, testCase.data);
      expect(engine).toBe(testCase.valid); // sanity: expectation matches the real engine
      expect(web).toBe(engine); // parity: shim agrees with the engine
    });
  }

  it('returns the original data and throws CHEXError', () => {
    const data = { age: 30 };
    expect(webValidate({ age: '^[0-9]+$' }, data)).toBe(data);
    expect(() => webValidate({ age: '^[0-9]+$' }, { age: 'x' })).toThrow(CHEXError);
  });
});
