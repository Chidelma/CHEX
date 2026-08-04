// CHEX client for the web, backed by the same Rust core as the `chex` binary.
//
// The browser can't spawn a subprocess, so this loads `chex.wasm` and calls it
// over a narrow C ABI. Unlike the hand-ported `chex.mjs` it replaces, there is
// no second implementation to keep in lockstep — error names and messages come
// straight from the core.
//
//   import { validate, ready } from './chex.mjs'
//
//   await ready()                       // optional: warm the module up front
//   const schema = { name: '^[A-Za-z]+ [A-Za-z]+$', age: '^[0-9]+$' }
//   validate(schema, { name: 'Jane Doe', age: 30 })   // returns the data
//   // throws CHEXError on a mismatch; err.name is the core's error class
//
// `chex.wasm` must sit next to this file, or pass its URL to `ready({ url })`.

const ABI_VERSION = 1
const OK = 0

const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()

export class CHEXError extends Error {
    /**
     * @param {string} name  Core error class: ValidationError, InvalidInputError, ...
     * @param {string} message
     */
    constructor(name, message) {
        super(message)
        this.name = name
    }
}

/** @type {{ exports: any } | null} */
let instance = null
/** @type {Promise<any> | null} */
let pending = null

/**
 * Compile and instantiate the module. Idempotent; safe to call concurrently.
 * @param {{ url?: string | URL, module?: WebAssembly.Module }} [options]
 * @returns {Promise<void>}
 */
export const ready = async (options = {}) => {
    if (instance) return
    pending ??= instantiate(options)
    try {
        instance = await pending
    } catch (error) {
        pending = null
        throw error
    }
}

const instantiate = async ({ url, module }) => {
    const source = url ? new URL(String(url), import.meta.url) : new URL('./chex.wasm', import.meta.url)
    const compiled = module ?? (await compile(source))
    // Given a Module, `instantiate` resolves to the Instance itself.
    const created = await WebAssembly.instantiate(compiled, {})

    const version = created.exports.chex_abi_version()
    if (version !== ABI_VERSION) {
        throw new CHEXError(
            'CHEXError',
            `chex.wasm ABI version ${version} does not match this client's ${ABI_VERSION}`
        )
    }
    return created
}

const compile = async (source) => {
    let response
    try {
        response = await fetch(source)
    } catch (cause) {
        throw new CHEXError('CHEXError', `Unable to fetch ${source.href}`, { cause })
    }
    if (!response.ok) {
        throw new CHEXError('CHEXError', `Unable to fetch ${source.href}: HTTP ${response.status}`)
    }
    return await WebAssembly.compile(await response.arrayBuffer())
}

/**
 * Validate `data` against an in-memory CHEX schema object.
 * Returns the original data on success; throws CHEXError on the first mismatch.
 *
 * Call `ready()` first — this is synchronous so it can't instantiate on demand.
 *
 * @template {Record<string, unknown>} T
 * @param {Record<string, unknown>} schema
 * @param {T} data
 * @param {string} [label]  Schema name used in error messages.
 * @returns {T}
 */
export const validate = (schema, data, label = 'schema') => {
    if (!instance) {
        throw new CHEXError('CHEXError', 'Call await ready() before validate()')
    }
    const { chex_alloc, chex_free, chex_validate, chex_result_ptr, chex_result_len, memory } =
        instance.exports

    const request = ENCODER.encode(JSON.stringify({ schema, data, label }))
    const pointer = chex_alloc(request.length)
    if (pointer === 0) throw new CHEXError('CHEXError', 'chex.wasm allocation failed')

    let code
    try {
        new Uint8Array(memory.buffer, pointer, request.length).set(request)
        code = chex_validate(pointer, request.length)
        if (code === OK) return data

        // `memory.buffer` may have been detached by a grow during the call.
        const length = chex_result_len()
        const bytes = new Uint8Array(memory.buffer, chex_result_ptr(), length).slice()
        const { name, message } = JSON.parse(DECODER.decode(bytes))
        throw new CHEXError(name, message)
    } finally {
        chex_free(pointer, request.length)
    }
}

export default { validate, ready, CHEXError }
