// Parity check for the in-process Kotlin validator (Chex.kt).
//
// Runs a battery of schema/data cases through BOTH the pure-Kotlin validator and
// the real `chex` binary (the oracle), and asserts they agree on accept/reject —
// the same lockstep guarantee the web and Flutter clients have.
//
//   kotlinc clients/android/Chex.kt clients/android/ChexParity.kt -include-runtime -d /tmp/chex-android.jar
//   java -jar /tmp/chex-android.jar ./dist-bin/chex
//
// Exits 0 when every case matches, 1 otherwise. Kotlin stdlib + JDK only. The
// validator under test takes native Maps; this harness serializes them to JSON
// (with a tiny encoder) only to feed the binary oracle.

import java.io.File
import java.nio.file.Files
import kotlin.system.exitProcess

data class ParityCase(
    val name: String,
    val schema: Map<String, Any?>,
    val data: Map<String, Any?>,
    val valid: Boolean,
)

val cases = listOf(
    ParityCase("primitive pass", mapOf("age" to "^[0-9]+$"), mapOf("age" to 30), true),
    ParityCase("primitive fail", mapOf("age" to "^[0-9]+$"), mapOf("age" to "x"), false),
    ParityCase("boolean coercion", mapOf("active" to "^(true|false)$"), mapOf("active" to true), true),
    ParityCase("nullable absent", mapOf("nickname?" to "^[a-z]+$"), mapOf(), true),
    ParityCase("nullable present ok", mapOf("nickname?" to "^[a-z]+$"), mapOf("nickname" to "ada"), true),
    ParityCase("nullable present bad", mapOf("nickname?" to "^[a-z]+$"), mapOf("nickname" to "A1"), false),
    ParityCase("missing required", mapOf("age" to "^[0-9]+$"), mapOf(), false),
    ParityCase("unknown property", mapOf("age" to "^[0-9]+$"), mapOf("age" to 1, "extra" to "x"), false),
    ParityCase("nested object ok", mapOf("addr" to mapOf("city" to "^[A-Za-z]+$")), mapOf("addr" to mapOf("city" to "Lagos")), true),
    ParityCase("nested object bad", mapOf("addr" to mapOf("city" to "^[A-Za-z]+$")), mapOf("addr" to mapOf("city" to "L4")), false),
    ParityCase("object type mismatch", mapOf("addr" to mapOf("city" to "^[A-Za-z]+$")), mapOf("addr" to "x"), false),
    ParityCase("scalar array ok", mapOf("tags" to listOf("^[a-z]+$")), mapOf("tags" to listOf("bun", "web")), true),
    ParityCase("scalar array bad", mapOf("tags" to listOf("^[a-z]+$")), mapOf("tags" to listOf("bun", "W1")), false),
    ParityCase("array type mismatch", mapOf("tags" to listOf("^[a-z]+$")), mapOf("tags" to "nope"), false),
    ParityCase("array of objects ok", mapOf("items" to listOf(mapOf("sku" to "^[A-Z0-9-]+$", "gift?" to "^(true|false)$"))), mapOf("items" to listOf(mapOf("sku" to "AB-1"), mapOf("sku" to "CD-2", "gift" to true))), true),
    ParityCase("array of objects bad", mapOf("items" to listOf(mapOf("sku" to "^[A-Z0-9-]+$"))), mapOf("items" to listOf(mapOf("sku" to "ab-1"))), false),
    ParityCase("record ok", mapOf("meta" to mapOf("^[a-z_]+$" to "^.+$")), mapOf("meta" to mapOf("a_b" to "x")), true),
    ParityCase("record bad key", mapOf("meta" to mapOf("^[a-z_]+$" to "^.+$")), mapOf("meta" to mapOf("A" to "x")), false),
    ParityCase("record bad value", mapOf("meta" to mapOf("^[a-z]+$" to "^[0-9]+$")), mapOf("meta" to mapOf("a" to "x")), false),
)

// Minimal JSON encoder — only to feed the binary oracle.
fun toJson(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    is Boolean, is Int, is Long, is Double -> value.toString()
    is Map<*, *> -> value.entries.joinToString(",", "{", "}") { "${toJson(it.key.toString())}:${toJson(it.value)}" }
    is List<*> -> value.joinToString(",", "[", "]") { toJson(it) }
    else -> throw IllegalArgumentException("unsupported JSON value: $value")
}

fun inProcessAccepts(schema: Map<String, Any?>, data: Map<String, Any?>): Boolean =
    try {
        CHEXValidator.validate(schema, data)
        true
    } catch (e: CHEXException) {
        false
    }

fun binaryAccepts(bin: String, dir: File, index: Int, schema: Map<String, Any?>, data: Map<String, Any?>): Boolean {
    val file = File(dir, "s$index.schema.json").apply { writeText(toJson(schema)) }
    val proc = ProcessBuilder(bin, "validate", file.path, toJson(data))
        .redirectOutput(ProcessBuilder.Redirect.DISCARD)
        .redirectError(ProcessBuilder.Redirect.DISCARD)
        .start()
    return proc.waitFor() == 0
}

fun main(args: Array<String>) {
    val bin = if (args.isNotEmpty()) args[0] else "chex"
    val dir = Files.createTempDirectory("chex-android-").toFile()
    var failures = 0
    try {
        cases.forEachIndexed { index, c ->
            val oracle = binaryAccepts(bin, dir, index, c.schema, c.data)
            val inProc = inProcessAccepts(c.schema, c.data)
            if (!(oracle == c.valid && inProc == oracle)) {
                failures++
                System.err.println("MISMATCH ${c.name}: expected=${c.valid} binary=$oracle inProcess=$inProc")
            }
        }
    } finally {
        dir.deleteRecursively()
    }
    if (failures == 0) {
        println("parity OK: ${cases.size} cases agree with the chex binary")
    } else {
        System.err.println("$failures/${cases.size} cases FAILED")
        exitProcess(1)
    }
}
