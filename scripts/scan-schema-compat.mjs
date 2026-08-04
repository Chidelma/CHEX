// Report *.schema.json files the CHEX core rejects.
//
//   bun ./scripts/scan-schema-compat.mjs path/to/your/schemas
//
// The regex engine is linear-time, which means no lookahead `(?=...)`, no
// lookbehind, and no backreferences `\1`. Schemas written against the old
// JavaScript build that use those will be reported here.
//
// Point it at your own schema directory. Run against this repo it will flag
// `examples/invalid/`, which exists to be rejected.

import { readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', 'target', '.git', 'dist', 'dist-bin', 'dist-web'])

const binary = process.env.CHEX_BINARY ? resolve(process.env.CHEX_BINARY) : resolve('target/release/chex')

const roots = process.argv.slice(2)
if (roots.length === 0) roots.push(process.cwd())

const rejected = []
let scanned = 0

for (const root of roots) {
    for await (const file of walk(root)) {
        scanned += 1
        // Empty data reaches schema loading and definition validation, which is
        // where an unsupported pattern surfaces. Data-shaped complaints mean the
        // schema itself loaded fine.
        const error = await definitionError(file)
        if (error) rejected.push([relative(process.cwd(), file), error])
    }
}

if (rejected.length === 0) {
    console.log(`${scanned} schema(s) scanned — all load cleanly`)
    process.exit(0)
}

console.error(`${rejected.length} of ${scanned} schema(s) are rejected:\n`)
for (const [path, message] of rejected) console.error(`  ${path}\n    ${message}`)
console.error('\nLookahead, lookbehind, and backreferences are unsupported by design.')
process.exit(1)

async function definitionError(file) {
    const proc = Bun.spawn([binary, 'validate', file, '{}'], {
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
    })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited

    let envelope
    try {
        envelope = JSON.parse(stdout)
    } catch {
        return stdout.trim() || 'the binary produced no output'
    }
    if (envelope.ok) return null

    const message = envelope.error?.message ?? 'unknown failure'
    const loaded = [
        'cannot be null or undefined',
        'does not exist in schema',
        'Type mismatch for',
        'RegEx pattern fails for property',
    ].some((fragment) => message.includes(fragment))
    return loaded ? null : message
}

async function* walk(directory) {
    let entries
    try {
        entries = await readdir(directory, { withFileTypes: true })
    } catch {
        return
    }
    for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) yield* walk(path)
        } else if (entry.name.toLowerCase().endsWith('.schema.json')) {
            yield path
        }
    }
}
