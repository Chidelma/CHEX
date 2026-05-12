#!/usr/bin/env bun
/**
 * @fileoverview `chex.generate` CLI. Walks `CHEX_SCHEMA_DIR` for `*.json` files
 * and writes a sibling `.d.ts` for each one.
 */

import { Glob } from 'bun';
import Gen from '../index.js';

const HELP = `chex.generate — generate TypeScript declarations from JSON schemas

Usage:
  chex.generate

Environment:
  CHEX_SCHEMA_DIR    Directory to scan recursively for *.json files (required)

Options:
  -h, --help    Show this help and exit

For each <name>.json found, writes <name>.d.ts alongside it.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const cwd = process.env.CHEX_SCHEMA_DIR;
if (!cwd) {
  console.error('chex.generate: CHEX_SCHEMA_DIR is not set');
  process.exit(1);
}

try {
  const glob = new Glob('**/*.json');
  const scannedFiles = await Array.fromAsync(glob.scan({ cwd }));

  if (scannedFiles.length === 0) {
    console.warn(`chex.generate: no JSON schema files found in ${cwd}`);
    process.exit(0);
  }

  let written = 0;
  for (const filePath of scannedFiles) {
    const fileName = filePath.split('/').pop()?.replace(/\.json$/, '');
    if (!fileName) continue;

    const schema = await Bun.file(`${cwd}/${filePath}`).json();
    const generated = Gen.generateDeclaration(schema, fileName);
    await Bun.write(`${cwd}/${filePath.replace(/\.json$/, '.d.ts')}`, generated);
    written++;
  }

  console.log(`chex.generate: wrote ${written} declaration file(s)`);
} catch (error) {
  console.error(`chex.generate: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
