import { describe, it, expect } from 'bun:test';
import Gen from '../../src/index.js';

const examplePath = (name) => new URL(`../../examples/${name}`, import.meta.url).pathname;
const validSchemaPath = (name) => examplePath(`valid/${name}.schema.json`);
const invalidSchemaPath = (name) => examplePath(`invalid/${name}.schema.json`);

// ---------------------------------------------------------------------------
// validateData
// ---------------------------------------------------------------------------

describe('validateData', () => {
  const personSchema = validSchemaPath('person');

  const validPerson = () => ({
    name: 'Jane Doe',
    age: '30',
    active: 'true',
    nickname: null,
    address: { city: 'Toronto', country: 'Canada' },
    tags: ['typescript', 'bun'],
    scores: ['95', '87'],
    meta: { employer: 'ACME', dept: 'engineering' },
  });

  it('returns the validated data when all fields are valid', async () => {
    const data = validPerson();
    const result = await Gen.validateData(personSchema, data);
    expect(result.name).toBe('Jane Doe');
    expect(result.age).toBe('30');
  });

  it('skips regex validation for a null nullable property', async () => {
    const data = validPerson();
    data.nickname = null;
    const result = await Gen.validateData(personSchema, data);
    expect(result.nickname).toBeNull();
  });

  it('throws for a property not defined in the schema', () => {
    const data = { ...validPerson(), unknownField: 'oops' };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "Property 'unknownField' does not exist in schema"
    );
  });

  it('throws for a type mismatch on an array property', () => {
    const data = { ...validPerson(), scores: 'not-an-array' };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "Type mismatch for 'scores' in schema"
    );
  });

  it('throws when a required property is null', () => {
    const data = { ...validPerson(), age: null };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "Property 'age' cannot be null or undefined in schema"
    );
  });

  it('throws when a required property is undefined', () => {
    const { age: _omit, ...rest } = validPerson();
    return expect(Gen.validateData(personSchema, rest)).rejects.toThrow(
      "Property 'age' cannot be null or undefined in schema"
    );
  });

  it('throws for a name that does not match the regex pattern', () => {
    const data = { ...validPerson(), name: 'madonna' };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'name' in schema"
    );
  });

  it('accepts a name that matches the regex pattern', () => {
    const data = { ...validPerson(), name: 'John Smith' };
    return expect(Gen.validateData(personSchema, data)).resolves.toBeDefined();
  });

  it('throws for an array element that does not match the regex pattern', () => {
    const data = { ...validPerson(), tags: ['typescript', 'BUN'] };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'tags' in schema"
    );
  });

  it('throws for a nested property regex mismatch', () => {
    const data = {
      ...validPerson(),
      address: { city: 'ABC123', country: 'Canada' },
    };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'address.city' in schema"
    );
  });

  it('throws for a Record entry with a non-matching value', () => {
    const data = { ...validPerson(), meta: { employer: '' } };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'meta.employer' in schema"
    );
  });

  it('throws for a Record entry with an invalid key', () => {
    const data = { ...validPerson(), meta: { '123': 'value' } };
    return expect(Gen.validateData(personSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'meta.<key:123>' in schema"
    );
  });

  it('throws when the schema file does not exist', () => {
    return expect(Gen.validateData(validSchemaPath('nonexistent'), { x: '1' })).rejects.toThrow(
      'Failed to load schema from'
    );
  });

  it('throws for an invalid schema name when resolving through a schema directory', () => {
    return expect(
      Gen.validateData('bad@name', {}, { schemaDir: examplePath('valid'), cache: new Map() })
    ).rejects.toThrow('Invalid schema name');
  });

  it('can validate against an exact schema file path', async () => {
    const result = await Gen.validateData(personSchema, validPerson(), {
      schemaPath: personSchema,
      cache: new Map(),
    });
    expect(result.name).toBe('Jane Doe');
  });

  it('throws when the schema file is not parseable JSON', () => {
    const notJsonPath = examplePath('invalid/non-json.txt');
    return expect(Gen.validateData(notJsonPath, {}, { cache: new Map() })).rejects.toThrow(
      'Schema path must point to a .schema.json file'
    );
  });

  it('throws when the schema path does not end with .schema.json', () => {
    const nonJsonPath = examplePath('invalid/wrong-extension.json');
    return expect(Gen.validateData(nonJsonPath, { name: 'Jane' }, { cache: new Map() })).rejects.toThrow(
      'Schema path must point to a .schema.json file'
    );
  });

  it('throws when the schema file uses JSONL content', () => {
    const jsonLinesPath = invalidSchemaPath('json-lines');
    return expect(Gen.validateData(jsonLinesPath, { name: 'Jane' }, { cache: new Map() })).rejects.toThrow(
      'Schema files must contain one JSON object, not JSONL'
    );
  });

  it('throws when a schema regex pattern is empty', () => {
    return expect(Gen.validateData(invalidSchemaPath('empty-pattern'), { name: 'Jane' }, { cache: new Map() })).rejects.toThrow(
      "Schema pattern for 'name' in schema"
    );
  });

  it('throws when a schema leaf is not a regex string', () => {
    return expect(Gen.validateData(invalidSchemaPath('non-string-leaf'), { name: 'Jane' }, { cache: new Map() })).rejects.toThrow(
      "Schema value for 'name' in schema"
    );
  });

  it('throws when an array schema does not contain a regex pattern', () => {
    return expect(Gen.validateData(invalidSchemaPath('empty-array-pattern'), { tags: ['bun'] }, { cache: new Map() })).rejects.toThrow(
      "Array schema for 'tags' in schema"
    );
  });

  it('throws when a schema regex pattern is invalid', () => {
    return expect(Gen.validateData(invalidSchemaPath('invalid-regex-pattern'), { name: 'Jane' }, { cache: new Map() })).rejects.toThrow(
      "Invalid RegEx pattern for 'name' in schema"
    );
  });

  it('throws when the schema object is empty', () => {
    return expect(Gen.validateData(invalidSchemaPath('empty-object'), {}, { cache: new Map() })).rejects.toThrow(
      'must define at least one property'
    );
  });
});

// ---------------------------------------------------------------------------
// validateData — regex patterns
// ---------------------------------------------------------------------------

describe('validateData (regex patterns)', () => {
  const statusSchema = validSchemaPath('status');

  const validStatus = () => ({
    direction: 'north',
    priority: '2',
    label: 'active',
    tag: null,
  });

  it('passes when all regex patterns match', async () => {
    const result = await Gen.validateData(statusSchema, validStatus());
    expect(result.direction).toBe('north');
    expect(result.priority).toBe('2');
    expect(result.label).toBe('active');
  });

  it('throws when a string value does not match the regex pattern', () => {
    const data = { ...validStatus(), direction: 'northwest' };
    return expect(Gen.validateData(statusSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'direction' in schema"
    );
  });

  it('skips regex check for a null nullable field', async () => {
    const data = { ...validStatus(), tag: null };
    const result = await Gen.validateData(statusSchema, data);
    expect(result.tag).toBeNull();
  });

  it('validates a non-null value against a nullable regex field', async () => {
    const data = { ...validStatus(), tag: 'a' };
    const result = await Gen.validateData(statusSchema, data);
    expect(result.tag).toBe('a');
  });

  it('throws when a non-null nullable regex field has an invalid value', () => {
    const data = { ...validStatus(), tag: 'z' };
    return expect(Gen.validateData(statusSchema, data)).rejects.toThrow(
      "RegEx pattern fails for property 'tag' in schema"
    );
  });
});

// ---------------------------------------------------------------------------
// validateData — regex patterns for numeric and string constraints
// ---------------------------------------------------------------------------

describe('validateData (regex patterns for numeric/string constraints)', () => {
  const measureSchema = validSchemaPath('measure');

  const validMeasure = () => ({
    score: '50',
    temperature: '-273.15',
    quantity: '10',
    username: 'alice',
    code: 'AB12',
  });

  it('passes when all constrained values match their regex patterns', async () => {
    const result = await Gen.validateData(measureSchema, validMeasure());
    expect(result.score).toBe('50');
  });

  // score: ^(100|[1-9]?[0-9])$  → 0-100
  it('passes at the minimum boundary (0)', async () => {
    const result = await Gen.validateData(measureSchema, { ...validMeasure(), score: '0' });
    expect(result.score).toBe('0');
  });

  it('passes at the maximum boundary (100)', async () => {
    const result = await Gen.validateData(measureSchema, { ...validMeasure(), score: '100' });
    expect(result.score).toBe('100');
  });

  it('throws when score is above maximum', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), score: '101' })).rejects.toThrow(
      "RegEx pattern fails for property 'score' in schema"
    );
  });

  it('throws when score is negative', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), score: '-5' })).rejects.toThrow(
      "RegEx pattern fails for property 'score' in schema"
    );
  });

  // quantity: ^[0-9]*[05]$ → multiples of 5
  it('passes when value is a multiple of 5', async () => {
    const result = await Gen.validateData(measureSchema, { ...validMeasure(), quantity: '25' });
    expect(result.quantity).toBe('25');
  });

  it('throws when value is not a multiple of 5', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), quantity: '7' })).rejects.toThrow(
      "RegEx pattern fails for property 'quantity' in schema"
    );
  });

  // username: ^.{3,20}$ → length 3-20
  it('passes at the minLength boundary', async () => {
    const result = await Gen.validateData(measureSchema, { ...validMeasure(), username: 'abc' });
    expect(result.username).toBe('abc');
  });

  it('throws when string is shorter than minLength', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), username: 'ab' })).rejects.toThrow(
      "RegEx pattern fails for property 'username' in schema"
    );
  });

  it('throws when string is longer than maxLength', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), username: 'a'.repeat(21) })).rejects.toThrow(
      "RegEx pattern fails for property 'username' in schema"
    );
  });

  // code: ^.{4}$ → exactly 4 chars
  it('passes when string length equals exactly 4', async () => {
    const result = await Gen.validateData(measureSchema, { ...validMeasure(), code: 'XY99' });
    expect(result.code).toBe('XY99');
  });

  it('throws when exact-length field is too short', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), code: 'AB1' })).rejects.toThrow(
      "RegEx pattern fails for property 'code' in schema"
    );
  });

  it('throws when exact-length field is too long', () => {
    return expect(Gen.validateData(measureSchema, { ...validMeasure(), code: 'AB123' })).rejects.toThrow(
      "RegEx pattern fails for property 'code' in schema"
    );
  });
});
