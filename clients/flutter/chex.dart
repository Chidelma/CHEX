// CHEX in-process validator for Flutter (and any pure Dart).
//
// Flutter mobile and web can't spawn the `chex` binary — iOS/Android sandboxes
// forbid exec of a bundled executable, and Flutter web has no dart:io at all.
// So, like the browser JS client, this validator runs the CHEX validation rules
// *in-process* against an in-memory schema object. No binary, no dart:io, no
// dependencies — it works on every Flutter target (and in plain Dart).
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
// exactly as the `chex` binary does. This is a faithful port of the binary's
// runtime validator, kept in lockstep by `chex_parity.dart`.

class CHEXError implements Exception {
  final String message;
  CHEXError(this.message);
  @override
  String toString() => 'CHEXError: $message';
}

const _maxRegexLength = 500;

bool _isNullableKey(String key) => key.endsWith('?');
String _dataKeyOf(String key) => _isNullableKey(key) ? key.substring(0, key.length - 1) : key;

// A schema object is a Record descriptor if its single key is a regex (starts with `^`).
bool _isRecordType(Map schema) {
  final keys = schema.keys.toList();
  return keys.length == 1 && (keys.first as String).startsWith('^');
}

void _testLeaf(dynamic value, dynamic pattern, String path) {
  if (pattern is! String || pattern.isEmpty) {
    throw CHEXError("Schema value for '$path' must be a non-empty regex string");
  }
  if (pattern.length > _maxRegexLength) {
    throw CHEXError("Regex pattern for '$path' exceeds maximum allowed length");
  }
  RegExp regex;
  try {
    regex = RegExp(pattern);
  } catch (_) {
    throw CHEXError("Invalid RegEx pattern for '$path'");
  }
  if (!regex.hasMatch('$value')) {
    throw CHEXError("RegEx pattern fails for property '$path'");
  }
}

Never _rejectMissing(String path) =>
    throw CHEXError("Property '$path' cannot be null or undefined");

void _validateProperty(Map schema, Map data, String schemaKey, String path) {
  final schemaValue = schema[schemaKey];
  final nullable = _isNullableKey(schemaKey);
  final dataKey = _dataKeyOf(schemaKey);
  final value = data[dataKey];
  final fullPath = path.isEmpty ? dataKey : '$path.$dataKey';
  final defined = value != null; // Dart has no `undefined`; a missing key reads as null.

  if (schemaValue is String) {
    if (!defined) return nullable ? null : _rejectMissing(fullPath);
    _testLeaf(value, schemaValue, fullPath);
    return;
  }

  if (schemaValue is List) {
    if (!defined) return nullable ? null : _rejectMissing(fullPath);
    if (value is! List) throw CHEXError("Type mismatch for '$fullPath': expected an array");
    final item = schemaValue.first;
    if (item is String) {
      for (final element in value) {
        _testLeaf(element, item, fullPath);
      }
    } else if (item is Map) {
      for (var i = 0; i < value.length; i++) {
        final element = value[i];
        if (element is! Map) throw CHEXError("Type mismatch for '$fullPath[$i]': expected an object");
        _walk(item, element, '$fullPath[$i]');
      }
    }
    return;
  }

  if (schemaValue is Map) {
    if (!defined) return nullable ? null : _rejectMissing(fullPath);
    if (value is! Map) throw CHEXError("Type mismatch for '$fullPath': expected an object");
    if (_isRecordType(schemaValue)) {
      final keyPattern = schemaValue.keys.first;
      final valuePattern = schemaValue[keyPattern];
      value.forEach((k, v) {
        _testLeaf(k, keyPattern, '$fullPath.<key:$k>');
        _testLeaf(v, valuePattern, '$fullPath.$k');
      });
    } else {
      _walk(schemaValue, value, fullPath);
    }
    return;
  }

  throw CHEXError("Schema value for '$fullPath' must be a regex string");
}

// Validate `data` against a schema object, recursively. Mirrors the binary's
// SchemaObjectValidator: reject unknown data keys, then check each schema key.
Map _walk(Map schema, Map data, String path) {
  for (final dataKey in data.keys) {
    if (schema.containsKey(dataKey) || schema.containsKey('$dataKey?')) continue;
    throw CHEXError("Property '$dataKey' does not exist in schema");
  }
  for (final schemaKey in schema.keys) {
    _validateProperty(schema, data, schemaKey as String, path);
  }
  return data;
}

/// Validate [data] against an in-memory CHEX schema object.
/// Returns the original data on success; throws [CHEXError] on the first mismatch.
Map<String, dynamic> validate(Map<String, dynamic> schema, Map<String, dynamic> data) {
  if (schema.isEmpty) throw CHEXError('Schema must define at least one property');
  _walk(schema, data, '');
  return data;
}
