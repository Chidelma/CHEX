// Run cargo through rustup's toolchain rather than whatever is first on PATH.
//
//   bun ./scripts/cargo.mjs build --release
//
// A Homebrew `cargo`/`rustc` earlier on PATH has no wasm32 std and mixes object
// files with rustup's, producing "can't find crate for `core`" and "compiled by
// an incompatible version of rustc". Prepending the toolchain's own bin fixes
// both, and keeps clippy-driver matched to rustc.

import { homedir } from 'node:os'
import { join } from 'node:path'

/** @returns {Promise<Record<string, string>>} PATH-corrected env for cargo. */
export const toolchainEnv = async () => {
    const active = await capture('rustup', ['show', 'active-toolchain'])
    const [name] = active.split(/\s+/)
    if (!name) throw new Error('rustup could not report an active toolchain')
    const bin = join(homedir(), '.rustup', 'toolchains', name, 'bin')
    return { ...process.env, PATH: `${bin}:${process.env.PATH}` }
}

export const cargo = async (args, extraEnv = {}) => {
    const env = { ...(await toolchainEnv()), ...extraEnv }
    const proc = Bun.spawn(['cargo', ...args], { stdout: 'inherit', stderr: 'inherit', env })
    const code = await proc.exited
    if (code !== 0) throw new Error(`cargo ${args.join(' ')} exited ${code}`)
}

async function capture(command, args) {
    const proc = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'inherit' })
    const stdout = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
    return stdout.trim()
}

if (import.meta.main) {
    await cargo(process.argv.slice(2))
}
