// CHEX in-process validator for iOS (and any Swift on Apple platforms).
//
// An iOS app can't spawn the `chex` binary — the sandbox forbids exec of a
// bundled executable. So this calls the CHEX core directly through its C ABI.
// The rules it runs are the binary's own, not a port of them, so there is
// nothing here that can drift out of lockstep.
//
// (On macOS/Linux — server-side Swift, CLI tools — you can instead drive the
// binary with the process-based client in `clients/swift/Chex.swift`.)
//
// Setup: build the library, then link it and expose `include/chex.h` to Swift
// through your bridging header or a module map.
//
//   bun ./scripts/build-mobile.mjs ios
//
//   let schema: [String: Any] = ["name": "^[A-Za-z]+ [A-Za-z]+$", "age": "^[0-9]+$"]
//   let data = try CHEXValidator.validate(schema, ["name": "Jane Doe", "age": 30])
//   // throws CHEXError on a schema mismatch
//
// `schema` is a plain dictionary (the decoded contents of a *.schema.json —
// bundle it as a resource or fetch it; an iOS app won't read it from an
// arbitrary path). Every leaf is a regex string; values are coerced to strings
// for matching, exactly as the `chex` binary does.

import Foundation

/// A validation failure. `name` is the core's error class — `ValidationError`,
/// `InvalidInputError`, and so on — the same value the binary reports.
struct CHEXError: Error {
    let name: String
    let message: String

    var localizedDescription: String { message }
}

enum CHEXValidator {
    /// Validate `data` against an in-memory CHEX schema object.
    /// Returns the original data on success; throws CHEXError on the first mismatch.
    @discardableResult
    static func validate(
        _ schema: [String: Any],
        _ data: [String: Any],
        label: String = "schema"
    ) throws -> [String: Any] {
        guard chex_abi_version() == UInt32(CHEX_ABI_VERSION) else {
            throw CHEXError(name: "CHEXError", message: "libchex ABI version mismatch")
        }

        let request: Data
        do {
            request = try JSONSerialization.data(
                withJSONObject: ["schema": schema, "data": data, "label": label]
            )
        } catch {
            throw CHEXError(
                name: "CHEXError",
                message: "Schema and data must be JSON-serialisable: \(error.localizedDescription)"
            )
        }

        let code = request.withUnsafeBytes { buffer in
            chex_validate(buffer.bindMemory(to: UInt8.self).baseAddress, request.count)
        }
        if code == CHEX_OK { return data }
        throw lastError()
    }

    /// Read the failure the last `chex_validate` left in the result buffer.
    private static func lastError() -> CHEXError {
        let length = chex_result_len()
        guard length > 0, let pointer = chex_result_ptr() else {
            return CHEXError(name: "CHEXError", message: "libchex reported a failure with no detail")
        }
        let body = Data(bytes: pointer, count: length)
        guard let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
              let name = json["name"] as? String,
              let message = json["message"] as? String
        else {
            return CHEXError(name: "CHEXError", message: "libchex returned an unreadable error")
        }
        return CHEXError(name: name, message: message)
    }
}
