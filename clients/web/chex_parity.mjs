// Smoke test for the Wasm binding in chex.mjs.
//
// chex.mjs loads the same engine the binary compiles from, so the validation
// rules can't disagree — what this checks is the binding: the linear-memory
// copy, the allocator handshake, the result buffer, and error decoding. It runs
// a battery of cases through both and asserts they agree on accept/reject.
//
//   bun ./scripts/build-wasm.mjs
//   bun clients/web/chex_parity.mjs ./target/release/chex
//
// Exits 0 when every case matches, 1 otherwise.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CHEXError, ready, validate } from './chex.mjs'

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
]

const binary = process.argv[2] ?? 'chex'
const wasm = process.env.CHEX_WASM ?? 'dist-web/chex.wasm'

// Compile from bytes rather than fetch(file://) so this runs headless.
await ready({ module: await WebAssembly.compile(await Bun.file(wasm).arrayBuffer()) })

const dir = await mkdtemp(join(tmpdir(), 'chex-web-'))
let failures = 0
let counter = 0

try {
    for (const testCase of cases) {
        const oracle = await binaryAccepts(testCase.schema, testCase.data)
        const viaWasm = wasmAccepts(testCase.schema, testCase.data)
        if (oracle !== testCase.valid || viaWasm !== oracle) {
            failures += 1
            console.error(
                `MISMATCH ${testCase.name}: expected=${testCase.valid} binary=${oracle} wasm=${viaWasm}`
            )
        }
    }

    // The contract the browser depends on: the original object back, and an
    // error carrying the engine's own class rather than a generic one.
    const data = { age: 30 }
    if (validate({ age: '^[0-9]+$' }, data) !== data) {
        failures += 1
        console.error('MISMATCH: validate did not return the original data object')
    }
    try {
        validate({ age: '^[0-9]+$' }, { age: 'x' }, 'user.schema.json')
        failures += 1
        console.error('MISMATCH: a failing validate did not throw')
    } catch (error) {
        if (!(error instanceof CHEXError) || error.name !== 'ValidationError') {
            failures += 1
            console.error(`MISMATCH: expected a ValidationError, got ${error.name}`)
        }
        if (!error.message.includes("in schema 'user.schema.json'")) {
            failures += 1
            console.error(`MISMATCH: the label is missing from ${error.message}`)
        }
    }
} finally {
    await rm(dir, { recursive: true, force: true })
}

if (failures > 0) {
    console.error(`${failures}/${cases.length} cases FAILED`)
    process.exit(1)
}
console.log(`parity OK: ${cases.length} cases agree with the chex binary`)

function wasmAccepts(schema, data) {
    try {
        validate(schema, data)
        return true
    } catch {
        return false
    }
}

async function binaryAccepts(schema, data) {
    const file = join(dir, `s${counter++}.schema.json`)
    await writeFile(file, JSON.stringify(schema))
    const proc = Bun.spawn([binary, 'validate', file, JSON.stringify(data)], {
        stdout: 'ignore',
        stderr: 'ignore',
        stdin: 'ignore',
    })
    return (await proc.exited) === 0
}
