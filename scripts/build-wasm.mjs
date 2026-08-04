// Build the browser Wasm module.
//
//   bun ./scripts/build-wasm.mjs        -> dist-web/chex.wasm + dist-web/chex.mjs

import { copyFile, mkdir, stat } from 'node:fs/promises'

import { cargo } from './cargo.mjs'

const TARGET = 'wasm32-unknown-unknown'

await cargo(['build', '--release', '--locked', '--lib', '--target', TARGET])

await mkdir('dist-web', { recursive: true })
await copyFile(`target/${TARGET}/release/chex.wasm`, 'dist-web/chex.wasm')
await copyFile('clients/web/chex.mjs', 'dist-web/chex.mjs')

const { size } = await stat('dist-web/chex.wasm')
console.log(`dist-web/chex.wasm — ${(size / 1024).toFixed(0)}K`)
