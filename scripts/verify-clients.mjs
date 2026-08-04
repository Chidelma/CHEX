// Run the Swift, Kotlin, and Dart client smoke tests against the built core.
//
//   bun ./scripts/verify-clients.mjs
//
// Each harness runs the same 19-case battery through its binding and through the
// `chex` binary, and asserts they agree. Toolchains that aren't installed are
// reported as skipped rather than failing the run.

import { resolve } from 'node:path'

import { cargo } from './cargo.mjs'

// Absolute: macOS refuses to dlopen a relative path from a hardened program.
const LIBRARY = resolve(
    `target/release/libchex${process.platform === 'darwin' ? '.dylib' : '.so'}`
)
const BINARY = 'target/release/chex'

await cargo(['build', '--release', '--locked', '--features', 'jni-bindings'])

const suites = [
    {
        name: 'web (wasm)',
        needs: 'bun',
        steps: [
            ['bun', ['./scripts/build-wasm.mjs']],
            ['bun', ['clients/web/chex_parity.mjs', BINARY]],
        ],
    },
    {
        name: 'swift (ios)',
        needs: 'swiftc',
        steps: [
            ['swiftc', ['-import-objc-header', 'include/chex.h', 'clients/ios/Chex.swift',
                'clients/ios/ChexParity.swift', '-L', 'target/release', '-lchex', '-o', '/tmp/chex-ios']],
            ['/tmp/chex-ios', [BINARY]],
        ],
    },
    {
        name: 'kotlin (android)',
        needs: 'kotlinc',
        steps: [
            ['kotlinc', ['clients/android/Chex.kt', 'clients/android/ChexParity.kt',
                '-include-runtime', '-d', '/tmp/chex-android.jar']],
            ['java', ['-Djava.library.path=target/release', '--enable-native-access=ALL-UNNAMED',
                '-jar', '/tmp/chex-android.jar', BINARY]],
        ],
    },
    {
        name: 'dart (flutter)',
        needs: 'dart',
        steps: [['dart', ['run', 'clients/flutter/chex_parity.dart', BINARY], { CHEX_LIBRARY: LIBRARY }]],
    },
]

// CI passes --require-all so a missing toolchain fails loudly instead of
// silently reducing coverage.
const requireAll = process.argv.includes('--require-all')

let failures = 0
for (const suite of suites) {
    if (!(await has(suite.needs))) {
        if (requireAll) {
            failures += 1
            console.error(`FAIL ${suite.name} — ${suite.needs} not installed`)
            continue
        }
        console.log(`skip ${suite.name} — ${suite.needs} not installed`)
        continue
    }
    try {
        for (const [command, args, env] of suite.steps) await run(command, args, env)
        console.log(`ok   ${suite.name}`)
    } catch (error) {
        failures += 1
        console.error(`FAIL ${suite.name} — ${error.message}`)
    }
}

process.exit(failures === 0 ? 0 : 1)

async function has(command) {
    const proc = Bun.spawn(['which', command], { stdout: 'ignore', stderr: 'ignore' })
    return (await proc.exited) === 0
}

async function run(command, args, env = {}) {
    const proc = Bun.spawn([command, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...env },
    })
    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ])
    if ((await proc.exited) !== 0) {
        throw new Error(`${command} exited non-zero\n${stdout}${stderr}`.trim())
    }
}
