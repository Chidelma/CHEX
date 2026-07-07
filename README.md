<div align="center">
  <p>
    <a href="https://github.com/d31ma/CHEX/releases/latest"><img src="https://img.shields.io/github/v/release/d31ma/CHEX?style=flat&label=release" alt="latest release"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-bun-f9f1e0?style=flat&logo=bun" alt="bun"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="license"></a>
  </p>

  <h1>CHEX</h1>

  <p>
    <strong>Regex-driven JSON validation for every runtime that can speak JSON.</strong>
  </p>

  <p>
    Use plain <code>*.schema.json</code> files in Bun apps, shell scripts, compiled executables,
    or non-JavaScript services that need a small, predictable validation contract.
  </p>

  <p>
    <a href="#install"><strong>Install</strong></a>
    ·
    <a href="#quick-start"><strong>Quick Start</strong></a>
    ·
    <a href="#cli"><strong>CLI</strong></a>
    ·
    <a href="#schema-format"><strong>Schema Format</strong></a>
    ·
    <a href="examples/valid"><strong>Examples</strong></a>
  </p>
</div>

---

<table>
<tr>
<td width="33%" valign="top">
<h3>One Schema Shape</h3>
<p>Every leaf is a regex string. Objects, arrays, nullable fields, and records all build from that same rule.</p>
</td>
<td width="33%" valign="top">
<h3>Runtime Neutral</h3>
<p>Run the CLI, drop in a language shim, or ship the compiled binary. No package install, no native addon.</p>
</td>
<td width="33%" valign="top">
<h3>Structured I/O</h3>
<p>Validation results and errors are JSON envelopes, so automation can consume them without scraping text.</p>
</td>
</tr>
</table>

## Highlights

<table>
<tr><th align="left">Capability</th><th align="left">What it gives app authors</th></tr>
<tr><td><strong>Regex-first schemas</strong></td><td>Small, portable validation files with no framework-specific schema DSL</td></tr>
<tr><td><strong><code>*.schema.json</code> convention</strong></td><td>Clear schema intent while still letting schemas live anywhere in the app</td></tr>
<tr><td><strong>Native JSON values</strong></td><td>Numbers and booleans can stay as numbers and booleans in data files</td></tr>
<tr><td><strong>Nested structures</strong></td><td>Validate objects, scalar arrays, arrays of objects, nullable fields, and records</td></tr>
<tr><td><strong>Language interop</strong></td><td>Python, Go, Ruby, PHP, Java, and shell callers can use the same validator through JSON</td></tr>
<tr><td><strong>Executable builds</strong></td><td>Compile CHEX into a standalone binary with <code>bun build --compile</code></td></tr>
</table>

---

## Install

CHEX ships as a single compiled binary plus thin per-language shims — no package
manager, no native addon. Install the `chex` binary from the [latest release](https://github.com/d31ma/CHEX/releases/latest):

macOS/Linux:

```bash
curl -fsSL https://github.com/d31ma/CHEX/releases/latest/download/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://github.com/d31ma/CHEX/releases/latest/download/install.ps1 | iex
```

Then verify: `chex --help`. Or build it yourself from this repo:

```bash
bun run build:exe   # → ./dist-bin/chex
```

### Use it from your language

Drop the one-file shim for your language ([`clients/`](clients/)) next to your
code — it drives the `chex` binary over stdio, no dependencies. Supported:
Python, Ruby, Node/TS, PHP, Go, Rust, C#, Java. See [`clients/README.md`](clients/README.md).

---

## Quick Start

Create a schema:

```json
{
  "name": "^[A-Za-z]+ [A-Za-z]+$",
  "age": "^[0-9]+$",
  "active": "^(true|false)$",
  "tags": ["^[a-z]+$"]
}
```

Validate data from any language via its shim (Node shown; see [`clients/`](clients/)):

```js
import { CHEX } from './clients/node/chex.mjs';

const c = new CHEX();
const data = await c.validate('./schemas/person.schema.json', {
  name: 'Jane Doe',
  age: 30,
  active: true,
  tags: ['bun', 'validation'],
});
console.log(data);
await c.close();
```

Validate the same data from a shell:

```bash
chex validate ./schemas/person.schema.json '{"name":"Jane Doe","age":30,"active":true,"tags":["bun"]}'
```

Successful CLI responses are JSON:

```json
{
  "protocolVersion": 1,
  "ok": true,
  "op": "validate",
  "durationMs": 2,
  "result": {
    "name": "Jane Doe",
    "age": 30,
    "active": true,
    "tags": ["bun"]
  }
}
```

---

## CLI

CHEX exposes a `chex` command. Every command writes structured JSON to stdout and exits non-zero on validation or input errors.

Useful commands:

<table>
<tr><th align="left">Command</th><th align="left">Description</th></tr>
<tr><td><code>chex validate &lt;schema-path&gt; &lt;json&gt;</code></td><td>Validate inline JSON against an exact schema path</td></tr>
<tr><td><code>chex validate &lt;schema-path&gt; @./data.json</code></td><td>Validate data loaded from a JSON file</td></tr>
<tr><td><code>cat data.json | chex validate &lt;schema-path&gt; -</code></td><td>Validate data read from stdin</td></tr>
<tr><td><code>chex validate person @./data.json --schema-dir ./schemas</code></td><td>Resolve <code>person</code> as <code>./schemas/person.schema.json</code></td></tr>
<tr><td><code>chex exec --request @./request.json</code></td><td>Run the machine interface from a request file</td></tr>
<tr><td><code>chex exec --loop</code></td><td>Persistent NDJSON loop over stdio — what the language shims drive</td></tr>
</table>

Build a standalone executable:

```bash
bun run build:exe
./dist-bin/chex validate ./schemas/person.schema.json @./person.json
```

---

## Machine Interface

Use `chex exec` when another runtime needs a stable request/response contract:

```bash
chex exec --request '{
  "requestId": "validate-1",
  "op": "validate",
  "schemaPath": "./schemas/person.schema.json",
  "data": { "name": "Jane Doe", "age": 30 }
}'
```

Successful responses:

```json
{
  "protocolVersion": 1,
  "ok": true,
  "op": "validate",
  "requestId": "validate-1",
  "durationMs": 2,
  "result": { "name": "Jane Doe", "age": 30 }
}
```

Error responses use the same envelope:

```json
{
  "protocolVersion": 1,
  "ok": false,
  "op": "validate",
  "requestId": "validate-1",
  "durationMs": 2,
  "error": {
    "name": "ValidationError",
    "message": "RegEx pattern fails for property 'age' in schema './schemas/person.schema.json'"
  }
}
```

---

## Schema Format

Schema files may live anywhere, but the schema path must end with `.schema.json`. File contents must be one valid JSON object, not JSONL. The top-level schema must be non-empty.

Every leaf value in a CHEX schema is a non-empty regex pattern string. Data values are coerced to strings for matching, so native JSON numbers and booleans are supported without pre-stringifying them. CHEX returns the original data object; it does not convert values in the result.

See [examples/valid](examples/valid/) for working schema and data pairs, and [examples/invalid](examples/invalid/) for schema files that CHEX intentionally rejects.

<details>
<summary><h3 style="display:inline">Primitive Fields</h3></summary>

```json
{
  "age": "^[0-9]+$",
  "active": "^(true|false)$",
  "label": "^.+$"
}
```

</details>

<details>
<summary><h3 style="display:inline">Nullable Fields</h3></summary>

Append `?` to a key name. If the data value is `null` or `undefined`, validation is skipped:

```json
{
  "nickname?": "^[a-zA-Z0-9_]+$"
}
```

</details>

<details>
<summary><h3 style="display:inline">Nested Objects</h3></summary>

Nested objects are validated recursively. Each leaf value is still a regex pattern:

```json
{
  "address": {
    "city": "^[A-Za-z]+$",
    "country": "^[A-Za-z]+$"
  }
}
```

</details>

<details>
<summary><h3 style="display:inline">Arrays</h3></summary>

An array schema must contain exactly one item template. Use a regex pattern for scalar arrays:

```json
{
  "tags": ["^[a-z]+$"]
}
```

Use an object template for arrays of objects:

```json
{
  "items": [
    {
      "sku": "^[A-Z0-9-]+$",
      "quantity": "^[1-9][0-9]*$",
      "giftWrap?": "^(true|false)$"
    }
  ]
}
```

</details>

<details>
<summary><h3 style="display:inline">Records</h3></summary>

An object is treated as a `Record<string, string>` type if its single key starts with `^`, which marks the key itself as the key regex. The value is the value regex:

```json
{
  "meta": {
    "^[a-zA-Z_]+$": "^.+$"
  }
}
```

This also lets you constrain numeric-looking keys:

```json
{
  "scores": {
    "^[0-9]+$": "^(100|[1-9]?[0-9])$"
  }
}
```

</details>

---

## API

Each language shim exposes a single `validate` method (see [`clients/`](clients/)):

```js
import { CHEX } from './clients/node/chex.mjs';

const c = new CHEX();
// path form — schema includes a separator or ends with .schema.json
await c.validate('./schemas/person.schema.json', data);
// name form — resolved as <schemaDir>/<schema>.schema.json
await c.validate('person', data, './schemas');
await c.close();
```

`schema` is treated as an exact schema path when it includes a path separator or ends with `.schema.json`. Otherwise, when `schemaDir` is provided, it is treated as a schema name and resolved as `<schemaDir>/<schema>.schema.json`. `validate` returns the validated data and throws when the data does not match.

---

## Validation Guarantees

- Name-based schema lookup validates schema names against `^[a-zA-Z0-9_.-]+$` and rejects `..`.
- Schema paths must end with `.schema.json`.
- Schema files must parse as one JSON object before validation can run; JSONL files are rejected.
- Schema definitions reject empty objects, empty regex strings, invalid regex strings, non-string leaf values, and arrays that do not contain exactly one regex string or one object schema.
- Regex patterns in schema values are limited to 500 characters.
- Validation returns the original data object when successful.

---

## Security

CHEX validates data shape and regex constraints. It does not provide authentication, authorization, or schema access control.

If callers provide schema paths, authorize and constrain those paths at your application boundary before passing them to CHEX. Treat schema files as trusted configuration: regexes are compiled and executed during validation, and overly broad schema access can expose files you did not intend to validate against.

---

## Development

```bash
bun install
bun test ./tests/
bun run typecheck
bun run build
bun run build:exe
```

Project examples double as test fixtures:

```text
examples/
  valid/
    *.schema.json
    *.data.json
  invalid/
    *.schema.json
```

---

## License

MIT
