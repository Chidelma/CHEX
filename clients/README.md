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
| Flutter (Dart)| `flutter/chex.dart`    | none (in-process) |
| iOS (Swift)   | `ios/Chex.swift`       | none (in-process) |
| Android (Kotlin) | `android/Chex.kt`   | none (in-process) |

> **Four clients are in-process.** A browser, a Flutter mobile/web app, an iOS
> app, and an Android app can't spawn the `chex` binary (no subprocess reachable —
> sandboxed, or no filesystem at all). So `web/chex.mjs`, `flutter/chex.dart`,
> `ios/Chex.swift`, and `android/Chex.kt` run the CHEX validation rules
> **in-process** against an in-memory schema object — no binary required. Each is
> the binary's own validator, linked rather than reimplemented — the browser via
> `chex.wasm`, the rest via the C ABI or JNI. Flutter **web** is the exception:
> no `dart:ffi` there, so it keeps a pure-Dart port under a parity check.
> See [In-process clients](#in-process-clients) below.
>
> The binary-driving `swift/Chex.swift` and `kotlin/Chex.kt` stay useful for
> server-side Swift and JVM Kotlin (Ktor, Spring, CLI, desktop), where the binary
> *can* be spawned.

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
  - `schemaDir` is a lookup base, not a sandbox: it constrains **names** only, so
    a path-shaped `schema` bypasses it. Validate untrusted input before passing
    it as `schema`.

Dynamic-JSON languages (Python, Ruby, Node, PHP, Go, C#, Swift, Dart) take `data`
as a native map/object. Languages without a bundled JSON builder (Rust, Java,
Kotlin) take `data` as a pre-serialized JSON **object string** and return the raw
response line — build the object with serde_json / Jackson / Gson /
kotlinx.serialization.

For anything else, use the raw `request(op)` escape hatch — see `chex --help`
and `src/main.rs` for the machine protocol.

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

## In-process clients

Four clients don't drive the binary — they run the CHEX validation rules
in-process against a schema **object** you already have in memory (fetched or
bundled as an asset, since these targets can't read a `*.schema.json` from disk).
Zero dependencies, no binary, no build step. The validation semantics — regex
leaves, string coercion, nullable `?` keys, nested objects, arrays, records,
unknown-property rejection — match the binary exactly.

### `web/chex.mjs` — browser JavaScript/TypeScript

A browser has no subprocess, filesystem, or network to reach the binary.

```js
import { ready, validate } from './chex.mjs'

await ready()   // compiles chex.wasm once
const schema = { name: '^[A-Za-z]+ [A-Za-z]+$', age: '^[0-9]+$' }
const data = validate(schema, { name: 'Jane Doe', age: 30 })  // returns the data
// throws CHEXError on a schema mismatch
```

Runs the engine itself, compiled to WebAssembly, so there is no second
implementation to keep in step. Serve `chex.wasm` beside `chex.mjs`. The module
needs no host imports, so the same pair works in Node, Bun, Deno, and Workers.

### `flutter/chex.dart` — Flutter (and any pure Dart)

Mobile and desktop call the engine over `dart:ffi`; Flutter web falls back to a
pure-Dart port in `chex_web.dart`, selected by conditional import.

Flutter mobile and web can't spawn the binary either — iOS/Android sandboxes
forbid exec of a bundled executable, and Flutter web has no `dart:io`. This
validator uses no `dart:io`, so it runs on every Flutter target. (On Flutter
**desktop** / Dart CLI you can instead use the process-based `dart/chex.dart`.)

```dart
import 'chex.dart';

final schema = {'name': r'^[A-Za-z]+ [A-Za-z]+$', 'age': r'^[0-9]+$'};
final data = validate(schema, {'name': 'Jane Doe', 'age': 30}); // returns the data
// throws CHEXError on a schema mismatch
```

Kept in lockstep by `flutter/chex_parity.dart`, a runnable check that agrees the
validator with the real binary over the same cases:
`dart run clients/flutter/chex_parity.dart ./dist-bin/chex`.

### `ios/Chex.swift` — iOS (and any pure Swift)

An iOS app can't exec a bundled binary (sandbox). This validator is Foundation
only, no subprocess. (On macOS/Linux — server-side Swift, CLI — use the
process-based `swift/Chex.swift` instead.)

```swift
import Foundation

let schema: [String: Any] = ["name": "^[A-Za-z]+ [A-Za-z]+$", "age": "^[0-9]+$"]
let data = try CHEXValidator.validate(schema, ["name": "Jane Doe", "age": 30])
// throws CHEXError on a schema mismatch
```

Kept in lockstep by `ios/ChexParity.swift`:
`swiftc clients/ios/Chex.swift clients/ios/ChexParity.swift -o /tmp/chex-ios && /tmp/chex-ios ./dist-bin/chex`.

### `android/Chex.kt` — Android (and any pure Kotlin/JVM)

An Android app can't exec a bundled binary (sandbox). This validator is Kotlin
stdlib only, no subprocess, and takes native `Map`s. (On JVM server/desktop use
the process-based `kotlin/Chex.kt` instead.)

```kotlin
val schema = mapOf("name" to "^[A-Za-z]+ [A-Za-z]+$", "age" to "^[0-9]+$")
val data = CHEXValidator.validate(schema, mapOf("name" to "Jane Doe", "age" to 30))
// throws CHEXException on a schema mismatch
```

Kept in lockstep by `android/ChexParity.kt`:
`kotlinc clients/android/Chex.kt clients/android/ChexParity.kt -include-runtime -d /tmp/chex-android.jar && java -jar /tmp/chex-android.jar ./dist-bin/chex`.
