<div align="center">

<h1>CHEX</h1>

<p><strong>Regex-driven JSON validation</strong> — validate data against plain <code>*.schema.json</code> files from any language, through a single binary.</p>

<p>
  <a href="https://github.com/d31ma/CHEX/releases/latest"><img src="https://img.shields.io/github/v/release/d31ma/CHEX?label=release&color=2ea043" alt="Latest release"></a>
  <a href="https://github.com/d31ma/CHEX/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/d31ma/CHEX/ci.yml?branch=main&label=build" alt="Build status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/clients-9%20languages-8957e5" alt="9 language clients">
  <a href="https://github.com/d31ma/CHEX/stargazers"><img src="https://img.shields.io/github/stars/d31ma/CHEX?style=flat&color=e3b341" alt="GitHub stars"></a>
</p>

<p>
  <code>curl -fsSL https://github.com/d31ma/CHEX/releases/latest/download/install.sh | sh</code>
</p>

<p>
  <a href="#installation">Install</a> &nbsp;·&nbsp;
  <a href="#language-clients">Clients</a> &nbsp;·&nbsp;
  <a href="#cli-and-binary-usage">CLI</a> &nbsp;·&nbsp;
  <a href="#schema-format">Schema</a> &nbsp;·&nbsp;
  <a href="#api-reference">API</a>
</p>

</div>

---

<table>
<tr>
<td width="33%" valign="top">

### 🔤 Regex-first schemas

Every leaf is a regex string. Objects, arrays, nullable fields, and records all build from that one rule — no framework-specific DSL.

</td>
<td width="33%" valign="top">

### 📄 `*.schema.json`

Schemas are plain JSON files that can live anywhere in your app. Clear intent, zero lock-in.

</td>
<td width="33%" valign="top">

### 🔢 Native JSON values

Numbers and booleans stay numbers and booleans — CHEX coerces to string only for matching and returns your data untouched.

</td>
</tr>
<tr>
<td width="33%" valign="top">

### 🌍 Any language

Dependency-free client shims for **9 languages** — 8 drive a single `chex` binary; the web one validates in-browser.

</td>
<td width="33%" valign="top">

### 📦 No package manager

Ship one binary from GitHub Releases. No npm, no native addons, no build step.

</td>
<td width="33%" valign="top">

### 🧩 Machine-friendly

Every command emits a structured JSON envelope, so any runtime can call CHEX over stdio.

</td>
</tr>
</table>

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [CLI and Binary Usage](#cli-and-binary-usage)
- [Language Clients](#language-clients)
- [API Reference](#api-reference)
- [Schema Format](#schema-format)
- [Validation Guarantees](#validation-guarantees)
- [Security](#security)
- [License](#license)

---

## Overview

CHEX validates a JSON data object against a schema whose every leaf value is a
regex pattern. A schema is just a `*.schema.json` file:

```json
{
  "name": "^[A-Za-z]+ [A-Za-z]+$",
  "age": "^[0-9]+$",
  "active": "^(true|false)$",
  "tags": ["^[a-z]+$"]
}
```

Validation returns the original data on success and fails with a structured
error on the first mismatch. Data values are coerced to strings for matching, so
native JSON numbers and booleans work without pre-stringifying them.

CHEX ships as a single self-contained `chex` binary. Your app calls it directly
on the CLI, or through a thin [client shim](clients/) for your language — no npm,
no native addon.

---

## Installation

CHEX ships as a single self-contained `chex` binary, published to
[GitHub Releases](https://github.com/d31ma/CHEX/releases). Any language uses it
through a thin [client shim](clients/) — no npm, no native addon.

### Install the binary

```sh
# macOS / Linux
curl -fsSL https://github.com/d31ma/CHEX/releases/latest/download/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://github.com/d31ma/CHEX/releases/latest/download/install.ps1 | iex
```

The installer downloads the right binary for your OS/arch from the latest
release, verifies its checksum, and puts `chex` on your PATH. Then verify:
`chex --help`.

Prefer to do it by hand? Download the asset for your platform from the
[latest release](https://github.com/d31ma/CHEX/releases/latest) —
`chex-linux-x64`, `chex-linux-arm64`, `chex-macos-x64`, `chex-macos-arm64`, or
`chex-windows-x64.exe` — `chmod +x` it, and move it onto your PATH. Checksums are
in `SHA256SUMS`.

Or build it from source with [Bun](https://bun.sh):

```sh
bun run build:exe   # → ./dist-bin/chex
```

### Use it from your language

Drop the one-file client for your language into your project and call CHEX like a
library — it drives the `chex` binary for you. See [clients/](clients/) for
Python, Ruby, Node/TS, PHP, Go, Rust, C#, and Java.

---

## CLI and Binary Usage

CHEX exposes a `chex` command. Every command writes structured JSON to stdout and
exits non-zero on validation or input errors, which makes it practical for
Python, Go, Ruby, PHP, Java, shell scripts, and other runtimes to call.

```sh
# Validate inline JSON against a schema path
chex validate ./schemas/person.schema.json '{"name":"Jane Doe","age":30}'

# Load the data from a file, or read it from stdin
chex validate ./schemas/person.schema.json @./person.json
cat person.json | chex validate ./schemas/person.schema.json -

# Resolve a schema *name* against a directory: ./schemas/person.schema.json
chex validate person @./person.json --schema-dir ./schemas
```

For language interop, use the machine interface:

```sh
chex exec --request '{"requestId":"validate-1","op":"validate","schemaPath":"./schemas/person.schema.json","data":{"name":"Jane Doe","age":30}}'
```

Successful responses look like this:

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

The language clients drive the persistent form, `chex exec --loop` — a
newline-delimited JSON loop that keeps one warm process for many validations.

---

## Language Clients

Any language uses CHEX through a thin, dependency-free [client shim](clients/)
that drives the `chex` binary over a persistent stdin/stdout loop. Drop the one
file for your language into your project and call `validate` like a library.
Method names follow each language's own convention — `snake_case`, `camelCase`,
or `PascalCase`. Full details in [clients/README.md](clients/README.md).

Each `validate(schema, data[, schemaDir])` returns the validated data and
raises/throws on a schema mismatch. `schema` is a **path** (contains a separator
or ends in `.schema.json`) or a **name** resolved against `schemaDir`.

| Language | Client file | Convention |
| --- | --- | --- |
| Python | [`clients/python/chex.py`](clients/python/chex.py) | `snake_case` |
| Ruby | [`clients/ruby/chex.rb`](clients/ruby/chex.rb) | `snake_case` |
| Node / TypeScript | [`clients/node/chex.mjs`](clients/node/chex.mjs) | `camelCase` |
| PHP | [`clients/php/chex.php`](clients/php/chex.php) | `camelCase` |
| Go | [`clients/go/chex.go`](clients/go/chex.go) | `PascalCase` |
| Rust | [`clients/rust/chex.rs`](clients/rust/chex.rs) | `snake_case` |
| C# | [`clients/csharp/Chex.cs`](clients/csharp/Chex.cs) | `PascalCase` |
| Java | [`clients/java/Chex.java`](clients/java/Chex.java) | `camelCase` |
| Web (browser) | [`clients/web/chex.mjs`](clients/web/chex.mjs) | `camelCase` |

> The **web** client is the odd one out: a browser can't spawn the `chex` binary,
> so it runs the validation rules in-process against an in-memory schema object —
> no binary, no network. A faithful port of the engine, kept in lockstep by a
> parity test.

<details open>
<summary><strong>Python</strong></summary>

```python
from chex import CHEX

with CHEX() as c:
    data = c.validate("./schemas/person.schema.json", {"name": "Jane Doe", "age": 30})
    print(data)  # {"name": "Jane Doe", "age": 30} — raises CHEXError on mismatch

    # name form: resolve "person" against a directory
    c.validate("person", {"name": "Jane Doe", "age": 30}, schema_dir="./schemas")
```

</details>

<details>
<summary><strong>Node / TypeScript</strong></summary>

```js
import { CHEX } from './chex.mjs'

const c = new CHEX()
const data = await c.validate('./schemas/person.schema.json', { name: 'Jane Doe', age: 30 })
console.log(data)                 // validated data — throws on mismatch
await c.validate('person', { name: 'Jane Doe', age: 30 }, './schemas')
await c.close()
```

</details>

<details>
<summary><strong>Ruby</strong></summary>

```ruby
require_relative 'chex'

CHEX.open do |c|
  data = c.validate('./schemas/person.schema.json', { 'name' => 'Jane Doe', 'age' => 30 })
  p data                                 # validated data — raises CHEX::Error on mismatch
  c.validate('person', { 'name' => 'Jane Doe', 'age' => 30 }, schema_dir: './schemas')
end
```

</details>

<details>
<summary><strong>PHP</strong></summary>

```php
require 'chex.php';

$c = new CHEX();
$data = $c->validate('./schemas/person.schema.json', ['name' => 'Jane Doe', 'age' => 30]);
print_r($data);                          // validated data — throws CHEXException on mismatch
$c->validate('person', ['name' => 'Jane Doe', 'age' => 30], './schemas');
$c->close();
```

</details>

<details>
<summary><strong>Go</strong></summary>

```go
import "yourmodule/chex" // copy chex.go into a package dir

c, _ := chex.Open("chex")
defer c.Close()

data, _ := c.Validate("./schemas/person.schema.json",
    map[string]any{"name": "Jane Doe", "age": 30}, "")
// name form: resolve "person" against a directory
c.Validate("person", map[string]any{"name": "Jane Doe", "age": 30}, "./schemas")
fmt.Println(data)
```

</details>

<details>
<summary><strong>Rust</strong></summary>

```rust
mod chex;
use chex::Chex;

let mut c = Chex::open("chex")?;
// data is a JSON object string (build it with serde_json); returns the response line
let resp = c.validate("./schemas/person.schema.json", r#"{"name":"Jane Doe","age":30}"#, None)?;
c.validate("person", r#"{"name":"Jane Doe","age":30}"#, Some("./schemas"))?;
c.close()?;
```

</details>

<details>
<summary><strong>C#</strong></summary>

```csharp
using var c = new Chex.Chex();
JsonElement data = c.Validate("./schemas/person.schema.json",
    new { name = "Jane Doe", age = 30 });   // validated data — throws ChexException on mismatch
c.Validate("person", new { name = "Jane Doe", age = 30 }, "./schemas");
```

</details>

<details>
<summary><strong>Java</strong></summary>

```java
try (Chex c = new Chex()) {
    // data is a JSON object string (build it with Jackson/Gson); returns the response line
    String resp = c.validate("./schemas/person.schema.json", "{\"name\":\"Jane Doe\",\"age\":30}", null);
    c.validate("person", "{\"name\":\"Jane Doe\",\"age\":30}", "./schemas");
}
```

</details>

<details>
<summary><strong>Web (browser)</strong></summary>

Runs in-process against a schema **object** — no binary, no `schemaDir`.

```js
import { validate } from './chex.mjs'

const schema = { name: '^[A-Za-z]+ [A-Za-z]+$', age: '^[0-9]+$' }
const data = validate(schema, { name: 'Jane Doe', age: 30 })  // returns the data
// throws CHEXError on a schema mismatch
```

</details>

---

## API Reference

Each client exposes a single method plus a raw escape hatch.

### `validate(schema, data[, schemaDir])`

Validate a JSON data object against a schema.

**Parameters:**
- `schema` — a **path** to a `*.schema.json` file (contains a path separator or
  ends in `.schema.json`), or a schema **name** resolved as
  `<schemaDir>/<schema>.schema.json` when `schemaDir` is given.
- `data` — the object to validate. Dynamic-JSON languages (Python, Ruby, Node,
  PHP, Go, C#) pass a native map/object; Rust and Java pass a pre-serialized JSON
  object string.
- `schemaDir` (optional) — directory to resolve a schema **name** against.

**Returns:** the validated data (the original object, unchanged). Dynamic
languages return the parsed value; Rust and Java return the raw JSON response
line.

**Raises / throws:** when the data does not match the schema, or the schema
cannot be loaded. The error carries CHEX's message
(e.g. `RegEx pattern fails for property 'age'…`).

### `request(op)` — raw escape hatch

Send one machine-protocol object and get the full response envelope back
(`{ ok, result | error, … }`). Use it for any operation not wrapped by a method.
See [`src/cli/machine.js`](src/cli/machine.js) and `chex --help`.

---

## Schema Format

Schema files may live anywhere, but the schema path must end with
`.schema.json`. File contents must be one valid JSON object, not JSONL. The
top-level schema must be non-empty.

Every leaf value in a CHEX schema is a non-empty regex pattern string. Data
values are coerced to strings for matching, so native JSON numbers and booleans
are supported without pre-stringifying them. CHEX returns the original data
object; it does not convert values in the result.

See [examples/valid](examples/valid/) for working schema and data pairs, and
[examples/invalid](examples/invalid/) for schema files that CHEX intentionally
rejects.

<details>
<summary><strong>Primitive fields</strong></summary>

```json
{
  "age": "^[0-9]+$",
  "active": "^(true|false)$",
  "label": "^.+$"
}
```

</details>

<details>
<summary><strong>Nullable fields</strong></summary>

Append `?` to a key name. If the data value is `null` or `undefined`, validation
is skipped:

```json
{
  "nickname?": "^[a-zA-Z0-9_]+$"
}
```

</details>

<details>
<summary><strong>Nested objects</strong></summary>

Nested objects are validated recursively. Each leaf value is still a regex
pattern:

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
<summary><strong>Arrays</strong></summary>

An array schema must contain exactly one item template. Use a regex pattern for
scalar arrays:

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
<summary><strong>Records</strong></summary>

An object is treated as a `Record<string, string>` type if its single key starts
with `^`, which marks the key itself as the key regex. The value is the value
regex:

```json
{
  "meta": {
    "^[a-zA-Z_]+$": "^.+$"
  }
}
```

You can also constrain numeric-looking keys:

```json
{
  "scores": {
    "^[0-9]+$": "^(100|[1-9]?[0-9])$"
  }
}
```

</details>

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

CHEX validates data shape and regex constraints. It does not provide
authentication, authorization, or schema access control.

If callers provide schema paths, authorize and constrain those paths at your
application boundary before passing them to CHEX. Treat schema files as trusted
configuration: regexes are compiled and executed during validation, and overly
broad schema access can expose files you did not intend to validate against.

The client shims spawn the `chex` binary directly with array arguments (no
shell), so there is no command-injection surface — but the binary path itself is
caller-controlled, so point it at a trusted `chex`.

---

## License

Released under the [MIT License](https://opensource.org/licenses/MIT).

<div align="center">
<sub>Built with <a href="https://bun.sh">Bun</a> · Distributed as a single binary via <a href="https://github.com/d31ma/CHEX/releases">GitHub Releases</a></sub>
</div>
