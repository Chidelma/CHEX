// CHEX in-process validator for iOS (and any pure Swift).
//
// An iOS app can't spawn the `chex` binary — the sandbox forbids exec of a
// bundled executable. So, like the browser JS and Flutter clients, this
// validator runs the CHEX validation rules *in-process* against an in-memory
// schema object. Foundation only, no subprocess, no dependencies.
//
// (On macOS/Linux — server-side Swift, CLI tools — you can instead drive the
// binary with the process-based client in `clients/swift/Chex.swift`.)
//
//   import Foundation
//
//   let schema: [String: Any] = ["name": "^[A-Za-z]+ [A-Za-z]+$", "age": "^[0-9]+$"]
//   let data = try CHEXValidator.validate(schema, ["name": "Jane Doe", "age": 30])
//   // throws CHEXError on a schema mismatch
//
// `schema` is a plain dictionary (the decoded contents of a *.schema.json —
// bundle it as a resource or fetch it; an iOS app won't read it from an
// arbitrary path). Every leaf is a regex string; values are coerced to strings
// for matching, exactly as the `chex` binary does. This is a faithful port of
// the binary's runtime validator, kept in lockstep by ChexParity.swift.

import Foundation

struct CHEXError: Error { let message: String }

enum CHEXValidator {
    private static let maxRegexLength = 500

    /// Validate `data` against an in-memory CHEX schema object.
    /// Returns the original data on success; throws CHEXError on the first mismatch.
    @discardableResult
    static func validate(_ schema: [String: Any], _ data: [String: Any]) throws -> [String: Any] {
        if schema.isEmpty { throw CHEXError(message: "Schema must define at least one property") }
        try walk(schema, data, "")
        return data
    }

    // Reject unknown data keys, then check each schema key.
    private static func walk(_ schema: [String: Any], _ data: [String: Any], _ path: String) throws {
        for dataKey in data.keys where schema[dataKey] == nil && schema[dataKey + "?"] == nil {
            throw CHEXError(message: "Property '\(dataKey)' does not exist in schema")
        }
        for schemaKey in schema.keys {
            try validateProperty(schema, data, schemaKey, path)
        }
    }

    private static func validateProperty(_ schema: [String: Any], _ data: [String: Any], _ schemaKey: String, _ path: String) throws {
        let schemaValue = schema[schemaKey] as Any
        let nullable = schemaKey.hasSuffix("?")
        let dataKey = nullable ? String(schemaKey.dropLast()) : schemaKey
        let value = data[dataKey]
        let fullPath = path.isEmpty ? dataKey : "\(path).\(dataKey)"
        let defined = value != nil && !(value is NSNull)

        if let pattern = schemaValue as? String {
            if !defined { if nullable { return }; throw missing(fullPath) }
            try testLeaf(value!, pattern, fullPath)
            return
        }

        if let itemSchemas = schemaValue as? [Any] {
            if !defined { if nullable { return }; throw missing(fullPath) }
            guard let elements = value as? [Any] else {
                throw CHEXError(message: "Type mismatch for '\(fullPath)': expected an array")
            }
            let item = itemSchemas[0]
            if let itemPattern = item as? String {
                for element in elements { try testLeaf(element, itemPattern, fullPath) }
            } else if let itemSchema = item as? [String: Any] {
                for (index, element) in elements.enumerated() {
                    guard let object = element as? [String: Any] else {
                        throw CHEXError(message: "Type mismatch for '\(fullPath)[\(index)]': expected an object")
                    }
                    try walk(itemSchema, object, "\(fullPath)[\(index)]")
                }
            }
            return
        }

        if let object = schemaValue as? [String: Any] {
            if !defined { if nullable { return }; throw missing(fullPath) }
            guard let dataObject = value as? [String: Any] else {
                throw CHEXError(message: "Type mismatch for '\(fullPath)': expected an object")
            }
            if isRecordType(object) {
                let keyPattern = Array(object.keys)[0]
                let valuePattern = object[keyPattern] as Any
                for (k, v) in dataObject {
                    try testLeaf(k, keyPattern, "\(fullPath).<key:\(k)>")
                    try testLeaf(v, valuePattern, "\(fullPath).\(k)")
                }
            } else {
                try walk(object, dataObject, fullPath)
            }
            return
        }

        throw CHEXError(message: "Schema value for '\(fullPath)' must be a regex string")
    }

    private static func missing(_ path: String) -> CHEXError {
        CHEXError(message: "Property '\(path)' cannot be null or undefined")
    }

    private static func isRecordType(_ schema: [String: Any]) -> Bool {
        let keys = Array(schema.keys)
        return keys.count == 1 && keys[0].hasPrefix("^")
    }

    private static func testLeaf(_ value: Any, _ pattern: Any, _ path: String) throws {
        guard let pattern = pattern as? String, !pattern.isEmpty else {
            throw CHEXError(message: "Schema value for '\(path)' must be a non-empty regex string")
        }
        if pattern.count > maxRegexLength {
            throw CHEXError(message: "Regex pattern for '\(path)' exceeds maximum allowed length")
        }
        let regex: NSRegularExpression
        do {
            regex = try NSRegularExpression(pattern: pattern)
        } catch {
            throw CHEXError(message: "Invalid RegEx pattern for '\(path)'")
        }
        let text = stringify(value)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        if regex.firstMatch(in: text, range: range) == nil {
            throw CHEXError(message: "RegEx pattern fails for property '\(path)'")
        }
    }

    // Coerce a value to a string the way the binary's String(value) does.
    private static func stringify(_ value: Any) -> String {
        if let string = value as? String { return string }
        // JSONSerialization yields NSNumber for both numbers and booleans, and
        // `NSNumber as? Bool` succeeds for any number — so disambiguate by type.
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue ? "true" : "false"
            }
            if number.doubleValue == number.doubleValue.rounded() && number.doubleValue.isFinite {
                return String(number.int64Value)
            }
            return number.stringValue
        }
        if let bool = value as? Bool { return bool ? "true" : "false" }
        if let int = value as? Int { return String(int) }
        if let double = value as? Double {
            return double == double.rounded() && double.isFinite ? String(Int(double)) : String(double)
        }
        return "\(value)"
    }
}
