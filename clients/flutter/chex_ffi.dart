// CHEX validator backend for every Dart target that has dart:ffi — Flutter on
// iOS, Android, macOS, Windows and Linux, plus plain Dart CLI.
//
// Calls the CHEX core through its C ABI, so the rules it runs are the binary's
// own rather than a port of them. Import `chex.dart`, not this file directly.

import 'dart:convert';
import 'dart:ffi';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'chex_error.dart';

const _abiVersion = 1;
const _ok = 0;

typedef _AbiVersionC = Uint32 Function();
typedef _AbiVersion = int Function();
typedef _AllocC = Pointer<Uint8> Function(IntPtr);
typedef _Alloc = Pointer<Uint8> Function(int);
typedef _FreeC = Void Function(Pointer<Uint8>, IntPtr);
typedef _Free = void Function(Pointer<Uint8>, int);
typedef _ValidateC = Int32 Function(Pointer<Uint8>, IntPtr);
typedef _Validate = int Function(Pointer<Uint8>, int);
typedef _ResultPtrC = Pointer<Uint8> Function();
typedef _ResultLenC = IntPtr Function();
typedef _ResultLen = int Function();

class _Lib {
  final _Alloc alloc;
  final _Free free;
  final _Validate validate;
  final _ResultPtrC resultPtr;
  final _ResultLen resultLen;

  _Lib(this.alloc, this.free, this.validate, this.resultPtr, this.resultLen);

  static _Lib? _instance;

  static _Lib get instance => _instance ??= _open();

  static _Lib _open() {
    final library = DynamicLibrary.open(_libraryName());
    final abiVersion =
        library.lookupFunction<_AbiVersionC, _AbiVersion>('chex_abi_version');
    if (abiVersion() != _abiVersion) {
      throw CHEXError('libchex ABI version ${abiVersion()} is not $_abiVersion');
    }
    return _Lib(
      library.lookupFunction<_AllocC, _Alloc>('chex_alloc'),
      library.lookupFunction<_FreeC, _Free>('chex_free'),
      library.lookupFunction<_ValidateC, _Validate>('chex_validate'),
      library.lookupFunction<_ResultPtrC, _ResultPtrC>('chex_result_ptr'),
      library.lookupFunction<_ResultLenC, _ResultLen>('chex_result_len'),
    );
  }

  /// Override with CHEX_LIBRARY when the library isn't beside the executable.
  static String _libraryName() {
    final override = Platform.environment['CHEX_LIBRARY'];
    if (override != null && override.isNotEmpty) return override;
    if (Platform.isMacOS || Platform.isIOS) return 'libchex.dylib';
    if (Platform.isWindows) return 'chex.dll';
    return 'libchex.so';
  }
}

/// Validate [data] against an in-memory CHEX schema object.
/// Returns the original data on success; throws [CHEXError] on the first mismatch.
Map<String, dynamic> validate(
  Map<String, dynamic> schema,
  Map<String, dynamic> data, {
  String label = 'schema',
}) {
  final library = _Lib.instance;
  final request = Uint8List.fromList(
    utf8.encode(jsonEncode({'schema': schema, 'data': data, 'label': label})),
  );

  // The core's own allocator, so this needs no package:ffi.
  final buffer = library.alloc(request.length);
  if (buffer == nullptr) throw CHEXError('libchex allocation failed');
  try {
    buffer.asTypedList(request.length).setAll(0, request);
    if (library.validate(buffer, request.length) == _ok) return data;
  } finally {
    library.free(buffer, request.length);
  }

  final length = library.resultLen();
  if (length == 0) throw CHEXError('libchex reported a failure with no detail');
  final body = utf8.decode(library.resultPtr().asTypedList(length));
  final decoded = jsonDecode(body) as Map<String, dynamic>;
  throw CHEXError(decoded['message'] as String, name: decoded['name'] as String);
}
