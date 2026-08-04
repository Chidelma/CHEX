// CHEX in-process validator for Android (and any Kotlin/JVM).
//
// An Android app can't spawn the `chex` binary — the app sandbox forbids
// executing a bundled binary. So this calls the CHEX core through JNI. The rules
// it runs are the binary's own, not a port of them, so there is nothing here
// that can drift out of lockstep.
//
// (On the JVM server/desktop — Ktor, Spring, CLI — you can instead drive the
// binary with the process-based client in `clients/kotlin/Chex.kt`.)
//
// Setup: build the native libraries and drop them into `src/main/jniLibs/`:
//
//   bun ./scripts/build-mobile.mjs android
//
// The JNI symbol is bound to this file's package, so `dev.chex` is not optional.
//
//   val schema = mapOf("name" to "^[A-Za-z]+ [A-Za-z]+$", "age" to "^[0-9]+$")
//   val data = CHEXValidator.validate(schema, mapOf("name" to "Jane Doe", "age" to 30))
//   // throws CHEXException on a schema mismatch
//
// `schema` and `data` are plain Maps (decode your *.schema.json into one — bundle
// it as an asset; an Android app won't read it from an arbitrary path). Every
// leaf is a regex string; values are coerced to strings for matching, exactly as
// the `chex` binary does.

package dev.chex

/** A validation failure. [errorName] is the core's error class, e.g. `ValidationError`. */
class CHEXException(val errorName: String, message: String) : RuntimeException(message)

internal object Chex {
    init {
        System.loadLibrary("chex")
    }

    /** Returns null on success, or `name` + U+001F + `message` on failure. */
    external fun nativeValidate(request: String): String?
}

object CHEXValidator {
    private const val SEPARATOR = '\u001F'

    /**
     * Validate [data] against an in-memory CHEX schema object.
     * Returns the original data on success; throws [CHEXException] on the first mismatch.
     */
    @JvmOverloads
    fun validate(
        schema: Map<String, Any?>,
        data: Map<String, Any?>,
        label: String = "schema",
    ): Map<String, Any?> {
        val request = toJson(mapOf("schema" to schema, "data" to data, "label" to label))
        val failure = Chex.nativeValidate(request) ?: return data
        // The name never contains a separator, so splitting once is enough.
        val split = failure.indexOf(SEPARATOR)
        if (split < 0) throw CHEXException("CHEXError", failure)
        throw CHEXException(failure.substring(0, split), failure.substring(split + 1))
    }

    // Just enough JSON to build the request. Android has org.json but the desktop
    // JVM does not, and a shared client should not need a dependency for either.
    private fun toJson(value: Any?): String = when (value) {
        null -> "null"
        is String -> encodeString(value)
        is Boolean, is Number -> value.toString()
        is Map<*, *> -> value.entries.joinToString(",", "{", "}") {
            "${encodeString(it.key.toString())}:${toJson(it.value)}"
        }
        is Iterable<*> -> value.joinToString(",", "[", "]") { toJson(it) }
        else -> throw CHEXException("CHEXError", "Unsupported JSON value: $value")
    }

    private fun encodeString(value: String): String {
        val out = StringBuilder(value.length + 2).append('"')
        for (char in value) {
            when {
                char == '"' -> out.append("\\\"")
                char == '\\' -> out.append("\\\\")
                char == '\n' -> out.append("\\n")
                char == '\r' -> out.append("\\r")
                char == '\t' -> out.append("\\t")
                char < ' ' -> out.append("\\u%04x".format(char.code))
                else -> out.append(char)
            }
        }
        return out.append('"').toString()
    }
}
