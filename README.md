# CHEX

CHEX is a language-agnostic utility for validating data against JSON schema files whose leaf values are regex patterns. It can be used as a Bun package or compiled to a standalone executable so non-JavaScript runtimes can validate data through a stable JSON CLI contract.

## Features

- **Validate data against schema files using regex patterns**
- **All leaf values are regex patterns — one format, no ambiguity**
- **Supports nullable fields (`?`), nested objects, arrays, and records**
- **Machine-readable CLI output for shelling out from Python, Go, Ruby, PHP, Java, and other runtimes**
- **Standalone binary builds with `bun build --compile`**

## Getting Started

### Installation

Public stable releases install from npm by default:

```sh
bun add @d31ma/chex
```

If you are a `d31ma` member and want the private beta channel from GitHub Packages instead, configure a user-level `.npmrc`:

```ini
# ~/.npmrc
@d31ma:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
always-auth=true
```

See GitHub's npm registry docs for the latest authentication details:
https://docs.github.com/packages/using-github-packages-with-your-projects-ecosystem/configuring-npm-for-use-with-github-packages

After that, the same `bun add @d31ma/chex` command will resolve from GitHub Packages for your user.

## CLI and Binary Usage

CHEX exposes a `chex` command. Every command writes structured JSON to stdout and exits non-zero on validation or input errors.

```sh
chex validate ./schemas/person.schema.json '{"name":"Jane Doe","age":"30"}'
```

You can pass JSON inline, from a file with `@path`, or from stdin with `-`:

```sh
chex validate ./schemas/person.schema.json @./person.json
cat ./person.json | chex validate ./schemas/person.schema.json -
```

If your project keeps schemas in one directory and uses `<name>.schema.json` files, you can opt into name-based lookup with an explicit directory:

```sh
chex validate person @./person.json --schema-dir ./schemas
```

For language interop, use the machine interface:

```sh
chex exec --request '{
  "requestId": "validate-1",
  "op": "validate",
  "schemaPath": "./schemas/person.schema.json",
  "data": { "name": "Jane Doe", "age": "30" }
}'
```

Successful responses look like this:

```json
{
  "protocolVersion": 1,
  "ok": true,
  "op": "validate",
  "requestId": "validate-1",
  "durationMs": 2,
  "result": { "name": "Jane Doe", "age": "30" }
}
```

Errors use the same envelope:

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

Build a standalone executable:

```sh
bun run build:exe
./dist-bin/chex validate ./schemas/person.schema.json @./person.json
```

## Schema Format

Schema files may live anywhere, but the schema path must end with `.schema.json`. File contents must be one valid JSON object, not JSONL. The top-level schema must be non-empty.

Every leaf value in a CHEX schema is a **non-empty regex pattern string**. Data values are coerced to strings and tested against the pattern. Append `?` to a key to mark it nullable.

See `examples/valid` for working schema and data pairs, and `examples/invalid` for schema files that CHEX intentionally rejects. The test suite uses these same files, so the examples stay aligned with runtime behavior.

### Primitive fields (regex patterns)

```json
{ "age": "^[0-9]+$", "active": "^(true|false)$", "label": "^.+$" }
```

### Nullable fields

Append `?` to the key name. If the data value is `null` or `undefined`, validation is skipped:

```json
{ "nickname?": "^[a-zA-Z0-9_]+$" }
```

### Nested objects

Nested objects are validated recursively — each leaf value is still a regex pattern:

```json
{
  "address": {
    "city": "^[A-Za-z]+$",
    "country": "^[A-Za-z]+$"
  }
}
```

### Arrays

An array must contain exactly one non-empty regex pattern. Every element of the data array is tested against it:

```json
{ "tags": ["^[a-z]+$"] }
```

### Records

An object is treated as a `Record<string, string>` type if its single key starts with `^`, which marks the key itself as the key regex. The value is the value regex:

```json
{ "meta": { "^[a-zA-Z_]+$": "^.+$" } }
```

This lets you constrain keys too — for example, numeric keys:

```json
{ "scores": { "^[0-9]+$": "^(100|[1-9]?[0-9])$" } }
```

## Security

### What CHEX does NOT provide

- **Authentication**: CHEX does not verify the identity of callers.
- **Authorization**: CHEX does not restrict which schema files a caller can access.
- **Path safety**: If callers provide schema paths, authorize and constrain those paths at your application boundary before passing them to CHEX.

### Input validation guarantees

- Name-based schema lookup validates schema names against `^[a-zA-Z0-9_.-]+$` and rejects `..`. Names with unsupported characters throw `Invalid schema name`.
- Schema paths must end with `.schema.json`.
- Schema files must parse as one JSON object before validation can run; JSONL files are rejected.
- Schema definitions reject empty objects, empty regex strings, invalid regex strings, non-string leaf values, and arrays that do not contain exactly one regex string.
- Regex patterns in schema values are limited to 500 characters. Patterns exceeding this limit throw rather than risking CPU exhaustion.

## License

MIT
