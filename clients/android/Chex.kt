// CHEX in-process validator for Android (and any pure Kotlin/JVM).
//
// An Android app can't spawn the `chex` binary — the app sandbox forbids
// executing a bundled binary. So, like the browser JS and Flutter clients, this
// validator runs the CHEX validation rules *in-process* against an in-memory
// schema object. Kotlin stdlib only, no subprocess, no dependencies.
//
// (On the JVM server/desktop — Ktor, Spring, CLI — you can instead drive the
// binary with the process-based client in `clients/kotlin/Chex.kt`.)
//
//   val schema = mapOf("name" to "^[A-Za-z]+ [A-Za-z]+$", "age" to "^[0-9]+$")
//   val data = CHEXValidator.validate(schema, mapOf("name" to "Jane Doe", "age" to 30))
//   // throws CHEXException on a schema mismatch
//
// `schema` and `data` are plain Maps (decode your *.schema.json into one — bundle
// it as an asset; an Android app won't read it from an arbitrary path). Every
// leaf is a regex string; values are coerced to strings for matching, exactly as
// the `chex` binary does. A faithful port of the binary's runtime validator,
// kept in lockstep by ChexParity.kt.

class CHEXException(message: String) : RuntimeException(message)

object CHEXValidator {
    private const val MAX_REGEX_LENGTH = 500

    /**
     * Validate [data] against an in-memory CHEX schema object.
     * Returns the original data on success; throws [CHEXException] on the first mismatch.
     */
    fun validate(schema: Map<String, Any?>, data: Map<String, Any?>): Map<String, Any?> {
        if (schema.isEmpty()) throw CHEXException("Schema must define at least one property")
        walk(schema, data, "")
        return data
    }

    // Reject unknown data keys, then check each schema key.
    private fun walk(schema: Map<String, Any?>, data: Map<String, Any?>, path: String) {
        for (dataKey in data.keys) {
            if (schema.containsKey(dataKey) || schema.containsKey("$dataKey?")) continue
            throw CHEXException("Property '$dataKey' does not exist in schema")
        }
        for (schemaKey in schema.keys) validateProperty(schema, data, schemaKey, path)
    }

    @Suppress("UNCHECKED_CAST")
    private fun validateProperty(schema: Map<String, Any?>, data: Map<String, Any?>, schemaKey: String, path: String) {
        val schemaValue = schema[schemaKey]
        val nullable = schemaKey.endsWith("?")
        val dataKey = if (nullable) schemaKey.dropLast(1) else schemaKey
        val value = data[dataKey]
        val fullPath = if (path.isEmpty()) dataKey else "$path.$dataKey"
        val defined = value != null

        when (schemaValue) {
            is String -> {
                if (!defined) return if (nullable) Unit else rejectMissing(fullPath)
                testLeaf(value, schemaValue, fullPath)
            }

            is List<*> -> {
                if (!defined) return if (nullable) Unit else rejectMissing(fullPath)
                if (value !is List<*>) throw CHEXException("Type mismatch for '$fullPath': expected an array")
                when (val item = schemaValue[0]) {
                    is String -> for (element in value) testLeaf(element, item, fullPath)
                    is Map<*, *> -> value.forEachIndexed { index, element ->
                        if (element !is Map<*, *>) throw CHEXException("Type mismatch for '$fullPath[$index]': expected an object")
                        walk(item as Map<String, Any?>, element as Map<String, Any?>, "$fullPath[$index]")
                    }
                }
            }

            is Map<*, *> -> {
                if (!defined) return if (nullable) Unit else rejectMissing(fullPath)
                if (value !is Map<*, *>) throw CHEXException("Type mismatch for '$fullPath': expected an object")
                val schemaObject = schemaValue as Map<String, Any?>
                if (isRecordType(schemaObject)) {
                    val keyPattern = schemaObject.keys.first()
                    val valuePattern = schemaObject[keyPattern]
                    for ((k, v) in value) {
                        testLeaf(k, keyPattern, "$fullPath.<key:$k>")
                        testLeaf(v, valuePattern, "$fullPath.$k")
                    }
                } else {
                    walk(schemaObject, value as Map<String, Any?>, fullPath)
                }
            }

            else -> throw CHEXException("Schema value for '$fullPath' must be a regex string")
        }
    }

    private fun rejectMissing(path: String): Nothing =
        throw CHEXException("Property '$path' cannot be null or undefined")

    private fun isRecordType(schema: Map<String, Any?>): Boolean {
        val keys = schema.keys.toList()
        return keys.size == 1 && keys[0].startsWith("^")
    }

    private fun testLeaf(value: Any?, pattern: Any?, path: String) {
        if (pattern !is String || pattern.isEmpty()) {
            throw CHEXException("Schema value for '$path' must be a non-empty regex string")
        }
        if (pattern.length > MAX_REGEX_LENGTH) {
            throw CHEXException("Regex pattern for '$path' exceeds maximum allowed length")
        }
        val regex = try {
            Regex(pattern)
        } catch (e: Exception) {
            throw CHEXException("Invalid RegEx pattern for '$path'")
        }
        if (!regex.containsMatchIn(stringify(value))) {
            throw CHEXException("RegEx pattern fails for property '$path'")
        }
    }

    // Coerce a value to a string the way the binary's String(value) does.
    private fun stringify(value: Any?): String = when (value) {
        is Boolean -> value.toString()
        is Double -> if (value == Math.floor(value) && value.isFinite()) value.toLong().toString() else value.toString()
        else -> value.toString()
    }
}
