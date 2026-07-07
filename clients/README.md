# CHEX language clients

Thin, dependency-free shims that let an app in any of these languages use CHEX
by driving the compiled `chex` binary. No package manager, no native addon —
drop in one file for your language and validate JSON against `*.schema.json` files.

| Language      | File                   | Runtime deps    |
| ------------- | ---------------------- | --------------- |
| Python        | `python/chex.py`       | none (stdlib)   |
| Ruby          | `ruby/chex.rb`         | none (stdlib)   |
| Node/TS       | `node/chex.mjs`        | none (stdlib)   |
| PHP           | `php/chex.php`         | none (ext-json) |
| Go            | `go/chex.go`           | none (stdlib)   |
| Rust          | `rust/chex.rs`         | none (std)      |
| C#            | `csharp/Chex.cs`       | none (BCL)      |
| Java          | `java/Chex.java`       | none (JDK)      |
| Swift         | `swift/Chex.swift`     | none (Foundation) |
| Kotlin        | `kotlin/Chex.kt`       | none (JDK)      |
| Dart          | `dart/chex.dart`       | none (SDK)      |
| Web (browser) | `web/chex.mjs`         | none (in-process) |

> **The web client is the exception.** A browser can't spawn the `chex` binary
> (no subprocess, no filesystem, no network), so `web/chex.mjs` runs the CHEX
> validation rules **in-process** against an in-memory schema object — no binary
> required. It's a faithful port of the binary's validator, kept in lockstep by a
> parity test. See [The web client](#the-web-client) below.

## Install the binary

Build it from this repo (`bun run build:exe` → `dist-bin/chex`) or grab a build
from the [GitHub releases](https://github.com/d31ma/CHEX/releases). Put `chex`
on your PATH, then verify: `chex --help`. Each shim also accepts an explicit
binary path if you don't want it on PATH.

macOS/Linux:

```sh
curl -fsSL https://github.com/d31ma/CHEX/releases/latest/download/install.sh | sh
```

Windows (PowerShell):

```powershell
irm https://github.com/d31ma/CHEX/releases/latest/download/install.ps1 | iex
```

## The API

Each shim exposes a `validate` method whose name follows **each language's own
paradigm** — `snake_case`/`camelCase`/`PascalCase` as appropriate:

- **`validate(schema, data[, schemaDir])`** — validate `data` against `schema`.
  - `schema` is either a **path** to a `*.schema.json` file (contains a `/` or
    ends in `.schema.json`) or a **name** resolved against `schemaDir`.
  - Returns the validated data on success; **raises/throws** when the data does
    not match the schema (the thrown error carries CHEX's message).

Dynamic-JSON languages (Python, Ruby, Node, PHP, Go, C#, Swift, Dart) take `data`
as a native map/object. Languages without a bundled JSON builder (Rust, Java,
Kotlin) take `data` as a pre-serialized JSON **object string** and return the raw
response line — build the object with serde_json / Jackson / Gson /
kotlinx.serialization.

For anything else, use the raw `request(op)` escape hatch — see `chex --help`
and `src/cli/machine.js` for the machine protocol.

## How it works

Each shim spawns **one** long-lived process — `chex exec --loop` — and talks to
it over stdin/stdout as newline-delimited JSON: one request object per line, one
response object per line, in order. No port, no network, no auth surface; the
child dies with your app.

## Concurrency

The shims send one request at a time and read one response (guarded by a lock
where the language needs it). The protocol carries a `requestId` echoed back in
each response, so if you need pipelining you can send many requests and match
replies by id — but one-in-flight is enough for most apps.

## Example (Python)

```python
from chex import CHEX

with CHEX() as c:
    # path form
    c.validate("./schemas/person.schema.json", {"name": "Ada"})
    # name form, resolved against a directory
    c.validate("person", {"name": "Ada"}, schema_dir="./schemas")
```

Construct, call `validate`, close when done (or use a
`with`/`using`/`try`-with-resources block). Each file's header comment has a
runnable example in that language.

## The web client

`web/chex.mjs` is for browser JavaScript/TypeScript. It does **not** drive the
binary — a browser has no subprocess, filesystem, or network to reach it — so it
runs the CHEX validation rules in-process against a schema **object** you already
have in memory (fetched or imported, since the browser can't read a
`*.schema.json` file from disk). Zero dependencies, no binary, no build step.

```js
import { validate } from './chex.mjs'

const schema = { name: '^[A-Za-z]+ [A-Za-z]+$', age: '^[0-9]+$' }
const data = validate(schema, { name: 'Jane Doe', age: 30 })  // returns the data
// throws CHEXError on a schema mismatch
```

The validation semantics — regex leaves, string coercion, nullable `?` keys,
nested objects, arrays, records, unknown-property rejection — match the binary
exactly, enforced by `tests/unit/web-client.test.js` (every case is run through
both the shim and the real engine). It works in Node/Bun too, which is how the
parity test exercises it.
