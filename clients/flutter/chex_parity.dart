// Parity check for the in-process Dart validator (chex.dart).
//
// Runs a battery of schema/data cases through BOTH the pure-Dart validator and
// the real `chex` binary (the oracle), and asserts they agree on accept/reject.
// This keeps the Flutter validator in lockstep with the binary the same way the
// web JS client is kept in lockstep with the engine.
//
//   dart run clients/flutter/chex_parity.dart ./dist-bin/chex
//
// Exits 0 when every case matches, 1 otherwise. Uses dart:io only in this
// harness — the validator under test (chex.dart) stays pure Dart.

import 'dart:convert';
import 'dart:io';

import 'chex.dart';

class Case {
  final String name;
  final Map<String, dynamic> schema;
  final Map<String, dynamic> data;
  final bool valid;
  const Case(this.name, this.schema, this.data, this.valid);
}

const cases = <Case>[
  Case('primitive pass', {'age': r'^[0-9]+$'}, {'age': 30}, true),
  Case('primitive fail', {'age': r'^[0-9]+$'}, {'age': 'x'}, false),
  Case('boolean coercion', {'active': r'^(true|false)$'}, {'active': true}, true),
  Case('nullable absent', {'nickname?': r'^[a-z]+$'}, {}, true),
  Case('nullable present ok', {'nickname?': r'^[a-z]+$'}, {'nickname': 'ada'}, true),
  Case('nullable present bad', {'nickname?': r'^[a-z]+$'}, {'nickname': 'A1'}, false),
  Case('missing required', {'age': r'^[0-9]+$'}, {}, false),
  Case('unknown property', {'age': r'^[0-9]+$'}, {'age': 1, 'extra': 'x'}, false),
  Case('nested object ok', {'addr': {'city': r'^[A-Za-z]+$'}}, {'addr': {'city': 'Lagos'}}, true),
  Case('nested object bad', {'addr': {'city': r'^[A-Za-z]+$'}}, {'addr': {'city': 'L4'}}, false),
  Case('object type mismatch', {'addr': {'city': r'^[A-Za-z]+$'}}, {'addr': 'x'}, false),
  Case('scalar array ok', {'tags': [r'^[a-z]+$']}, {'tags': ['bun', 'web']}, true),
  Case('scalar array bad', {'tags': [r'^[a-z]+$']}, {'tags': ['bun', 'W1']}, false),
  Case('array type mismatch', {'tags': [r'^[a-z]+$']}, {'tags': 'nope'}, false),
  Case('array of objects ok', {'items': [{'sku': r'^[A-Z0-9-]+$', 'gift?': r'^(true|false)$'}]},
      {'items': [{'sku': 'AB-1'}, {'sku': 'CD-2', 'gift': true}]}, true),
  Case('array of objects bad', {'items': [{'sku': r'^[A-Z0-9-]+$'}]}, {'items': [{'sku': 'ab-1'}]}, false),
  Case('record ok', {'meta': {r'^[a-z_]+$': r'^.+$'}}, {'meta': {'a_b': 'x'}}, true),
  Case('record bad key', {'meta': {r'^[a-z_]+$': r'^.+$'}}, {'meta': {'A': 'x'}}, false),
  Case('record bad value', {'meta': {r'^[a-z]+$': r'^[0-9]+$'}}, {'meta': {'a': 'x'}}, false),
];

bool inProcessAccepts(Map<String, dynamic> schema, Map<String, dynamic> data) {
  try {
    validate(schema, data);
    return true;
  } on CHEXError {
    return false;
  }
}

int _counter = 0;
bool binaryAccepts(String bin, Directory dir, Map<String, dynamic> schema, Map<String, dynamic> data) {
  final file = File('${dir.path}/s${_counter++}.schema.json')..writeAsStringSync(jsonEncode(schema));
  final result = Process.runSync(bin, ['validate', file.path, jsonEncode(data)]);
  return result.exitCode == 0;
}

void main(List<String> args) {
  final bin = args.isNotEmpty ? args[0] : 'chex';
  final dir = Directory.systemTemp.createTempSync('chex-flutter-');
  var failures = 0;
  try {
    for (final c in cases) {
      final oracle = binaryAccepts(bin, dir, c.schema, c.data);
      final inProc = inProcessAccepts(c.schema, c.data);
      final ok = oracle == c.valid && inProc == oracle;
      if (!ok) {
        failures++;
        stderr.writeln("MISMATCH ${c.name}: expected=${c.valid} binary=$oracle inProcess=$inProc");
      }
    }
  } finally {
    dir.deleteSync(recursive: true);
  }
  if (failures == 0) {
    stdout.writeln('parity OK: ${cases.length} cases agree with the chex binary');
  } else {
    stderr.writeln('$failures/${cases.length} cases FAILED');
    exit(1);
  }
}
