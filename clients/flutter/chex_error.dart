// The failure type shared by both CHEX validator backends.

/// A validation failure.
///
/// On every target except Flutter web, [name] is the core's own error class —
/// `ValidationError`, `InvalidInputError`, `SchemaLoadError`, and so on. The web
/// fallback reports `CHEXError` for all of them.
class CHEXError implements Exception {
  final String name;
  final String message;

  CHEXError(this.message, {this.name = 'CHEXError'});

  @override
  String toString() => 'CHEXError: $message';
}
