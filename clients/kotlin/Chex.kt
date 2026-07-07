// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// No dependencies (java.lang.Process only). Requires the `chex` binary on PATH
// or an explicit path. One long-lived subprocess.
//
//   Chex("chex").use { c ->
//       // data is a JSON object string (build it with kotlinx.serialization / Gson)
//       val resp = c.validate("./schemas/person.schema.json", "{\"name\":\"Jane Doe\",\"age\":30}")
//       val resp2 = c.validate("person", "{\"name\":\"Jane Doe\",\"age\":30}", "./schemas")
//   }
//
// `validate` checks the response succeeded and returns the raw JSON response
// line (parse `result` with kotlinx.serialization / Gson); it throws on a schema
// mismatch. Method names follow Kotlin's camelCase. request(json) is the raw
// escape hatch.

import java.io.BufferedReader
import java.io.BufferedWriter

class CHEXException(message: String) : RuntimeException(message)

class Chex(binary: String = "chex") : AutoCloseable {
    private val proc: Process = ProcessBuilder(binary, "exec", "--loop")
        .redirectError(ProcessBuilder.Redirect.INHERIT)
        .start()
    private val writer: BufferedWriter = proc.outputStream.bufferedWriter()
    private val reader: BufferedReader = proc.inputStream.bufferedReader()

    /** Send one raw machine-protocol op (JSON string); returns the response line. */
    @Synchronized
    fun request(opJson: String): String {
        if (!proc.isAlive) throw CHEXException("chex process has exited")
        writer.write(opJson.trimEnd())
        writer.write("\n")
        writer.flush()
        return reader.readLine() ?: throw CHEXException("chex closed the stream")
    }

    /**
     * Validate a JSON object string against a schema (name or .schema.json path).
     * Pass schemaDir to resolve a name against a directory. Returns the raw
     * response line; throws on a schema mismatch.
     */
    fun validate(schema: String, dataJson: String, schemaDir: String? = null): String {
        val op = StringBuilder("{\"op\":\"validate\",\"schema\":")
            .append(jsonString(schema))
            .append(",\"data\":").append(dataJson.trim())
        if (schemaDir != null) {
            op.append(",\"schemaDir\":").append(jsonString(schemaDir))
        }
        val resp = request(op.append("}").toString())
        if (!resp.contains("\"ok\":true")) throw CHEXException(resp.trim())
        return resp
    }

    override fun close() {
        writer.close() // EOF ends the loop
        proc.waitFor()
        reader.close()
    }

    // Minimal JSON string encoder.
    private fun jsonString(value: String): String =
        "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
