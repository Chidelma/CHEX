# CHEX

CHEX is a JavaScript utility for generating type declarations from JSON schema files and validating data against those schemas. It is built to work with Bun and supports schema-driven validation and automatic interface generation.

## Features

- **Generate TypeScript interfaces from JSON schemas**
- **Validate data against collection schemas using regex patterns**
- **All leaf values are regex patterns — one format, no ambiguity**
- **Supports nullable fields (`?`), nested objects, arrays, and records**
- **Automatic scanning and generation of `.d.ts` files for all schemas in a directory**

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

## Schema Format

Every leaf value in a CHEX schema is a **regex pattern string**. Data values are coerced to strings and tested against the pattern. Append `?` to a key to mark it nullable.

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

An array contains a single regex pattern. Every element of the data array is tested against it:

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
- **Authorization**: CHEX does not restrict which collections a caller can access.
- **Path safety**: Always sanitize collection names before passing them to `validateData`. CHEX enforces `^[a-zA-Z0-9_-]+$` and throws immediately for invalid names.

### Input validation guarantees

- Collection names passed to `validateData` are validated against `^[a-zA-Z0-9_-]+$`. Path traversal strings like `../../../etc/passwd` throw `Invalid collection name` immediately.
- Interface names passed to `generateDeclaration` must be valid TypeScript identifiers (`^[a-zA-Z_$][a-zA-Z0-9_$]*$`). Injection payloads throw `Invalid interface name`.
- Regex patterns in schema values are limited to 500 characters. Patterns exceeding this limit throw rather than risking CPU exhaustion.

## License

MIT
