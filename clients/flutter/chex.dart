// CHEX in-process validator for Flutter (and any Dart).
//
// Flutter mobile can't spawn the `chex` binary — iOS/Android sandboxes forbid
// exec of a bundled executable — and Flutter web has no dart:io at all. So this
// validates in-process, picking a backend per target:
//
//   iOS, Android, macOS, Windows, Linux, Dart CLI -> chex_ffi.dart
//       Calls the CHEX core through its C ABI. Same rules as the binary, so
//       nothing can drift. Build the library first:
//
//           bun ./scripts/build-mobile.mjs android ios
//
//       Flutter bundles it from the platform folders; for plain Dart, put it
//       beside the executable or point CHEX_LIBRARY at it.
//
//   Flutter web -> chex_web.dart
//       A hand-maintained pure-Dart port, because dart:ffi does not exist on the
//       web. Kept in lockstep by chex_parity.dart. Its messages omit the schema
//       label and report every failure as `CHEXError`.
//
// (On Flutter *desktop* / Dart CLI you can instead drive the binary with the
// process-based client in `clients/dart/chex.dart`.)
//
//   import 'chex.dart';
//
//   final schema = {'name': r'^[A-Za-z]+ [A-Za-z]+$', 'age': r'^[0-9]+$'};
//   final data = validate(schema, {'name': 'Jane Doe', 'age': 30}); // returns the data
//   // throws CHEXError on a schema mismatch
//
// `schema` is a plain Map (the decoded contents of a *.schema.json — fetch or
// bundle it as an asset; the browser/mobile target can't read it from disk).
// Every leaf is a regex string; values are coerced to strings for matching,
// exactly as the `chex` binary does.

export 'chex_error.dart';
export 'chex_ffi.dart' if (dart.library.js_interop) 'chex_web.dart';
