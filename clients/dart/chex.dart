// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// Dart SDK only (dart:io, dart:convert). Requires the `chex` binary on PATH or
// an explicit path. One long-lived subprocess.
//
//   final c = await CHEX.open();
//   try {
//     final data = await c.validate('./schemas/person.schema.json', {'name': 'Jane Doe', 'age': 30});
//     // name form, resolved against a directory:
//     await c.validate('person', {'name': 'Jane Doe', 'age': 30}, schemaDir: './schemas');
//   } finally {
//     await c.close();
//   }
//
// `validate` returns the validated data and throws CHEXException on a schema
// mismatch. Method names follow Dart's camelCase. `request` is a raw escape
// hatch returning the full response map. Requests are queued: each completes
// with its own response line, in order.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

class CHEXException implements Exception {
  final String message;
  CHEXException(this.message);
  @override
  String toString() => 'CHEXException: $message';
}

class CHEX {
  final Process _proc;
  final _queue = <Completer<Map<String, dynamic>>>[];

  CHEX._(this._proc) {
    _proc.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) {
      if (line.trim().isEmpty) return;
      if (_queue.isEmpty) return;
      _queue.removeAt(0).complete(jsonDecode(line) as Map<String, dynamic>);
    }, onDone: () {
      final error = CHEXException('chex closed the stream (stderr may have details)');
      while (_queue.isNotEmpty) {
        _queue.removeAt(0).completeError(error);
      }
    });
  }

  /// Start a warm chex process. [binary] defaults to "chex".
  static Future<CHEX> open([String binary = 'chex']) async {
    final proc = await Process.start(binary, ['exec', '--loop']);
    return CHEX._(proc);
  }

  /// Send one raw machine-protocol op; complete with the full response map.
  Future<Map<String, dynamic>> request(Map<String, dynamic> op) {
    final completer = Completer<Map<String, dynamic>>();
    _queue.add(completer);
    _proc.stdin.writeln(jsonEncode(op));
    return completer.future;
  }

  /// Validate [data] against a schema (name or .schema.json path). Returns the validated data.
  Future<dynamic> validate(String schema, Map<String, dynamic> data, {String? schemaDir}) async {
    final op = <String, dynamic>{'op': 'validate', 'schema': schema, 'data': data};
    if (schemaDir != null) op['schemaDir'] = schemaDir;
    final response = await request(op);
    if (response['ok'] != true) {
      final error = response['error'];
      throw CHEXException(error is Map ? (error['message'] ?? 'chex error') : 'chex error');
    }
    return response['result'];
  }

  /// Close stdin so the loop ends, and wait for the process to exit.
  Future<void> close() async {
    await _proc.stdin.close();
    await _proc.exitCode;
  }
}
