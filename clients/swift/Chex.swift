// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// Foundation only, no SwiftPM dependencies. Requires the `chex` binary on PATH
// or an explicit path. One long-lived subprocess.
//
//   let c = try CHEX()
//   defer { c.close() }
//   let data = try c.validate("./schemas/person.schema.json", ["name": "Jane Doe", "age": 30])
//   // name form, resolved against a directory:
//   try c.validate("person", ["name": "Jane Doe", "age": 30], schemaDir: "./schemas")
//
// `validate` returns the validated data and throws CHEXError on a schema
// mismatch. Method names follow Swift's camelCase. `request(_:)` is a raw escape
// hatch returning the full response dictionary.

import Foundation

struct CHEXError: Error { let message: String }

final class CHEX {
    private let proc = Process()
    private let stdinPipe = Pipe()
    private let stdoutPipe = Pipe()
    private let lock = NSLock()
    private var buffer = Data()

    init(binary: String = "chex") throws {
        // /usr/bin/env resolves `binary` against PATH.
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        proc.arguments = [binary, "exec", "--loop"]
        proc.standardInput = stdinPipe
        proc.standardOutput = stdoutPipe
        try proc.run()
    }

    /// Send one raw machine-protocol op; return the full response dictionary.
    func request(_ op: [String: Any]) throws -> [String: Any] {
        let payload = try JSONSerialization.data(withJSONObject: op)
        lock.lock() // ponytail: one call in flight; drop the lock only if you pipeline
        defer { lock.unlock() }
        guard proc.isRunning else { throw CHEXError(message: "chex process has exited") }
        let handle = stdinPipe.fileHandleForWriting
        handle.write(payload)
        handle.write(Data([0x0a]))
        let line = try readLine()
        guard let object = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else {
            throw CHEXError(message: "chex returned a non-object response")
        }
        return object
    }

    /// Validate `data` against a schema (name or .schema.json path). Returns the validated data.
    @discardableResult
    func validate(_ schema: String, _ data: [String: Any], schemaDir: String? = nil) throws -> Any {
        var op: [String: Any] = ["op": "validate", "schema": schema, "data": data]
        if let schemaDir = schemaDir { op["schemaDir"] = schemaDir }
        let response = try request(op)
        guard (response["ok"] as? Bool) == true else {
            let message = (response["error"] as? [String: Any])?["message"] as? String ?? "chex error"
            throw CHEXError(message: message)
        }
        return response["result"] as Any
    }

    /// Close stdin so the loop ends, and wait for the process to exit.
    func close() {
        guard proc.isRunning else { return }
        stdinPipe.fileHandleForWriting.closeFile()
        proc.waitUntilExit()
    }

    // Read one newline-delimited line from stdout, buffering across reads.
    private func readLine() throws -> String {
        while true {
            if let index = buffer.firstIndex(of: 0x0a) {
                let lineData = buffer[buffer.startIndex..<index]
                buffer.removeSubrange(buffer.startIndex...index)
                return String(decoding: lineData, as: UTF8.self)
            }
            let chunk = stdoutPipe.fileHandleForReading.availableData
            if chunk.isEmpty { throw CHEXError(message: "chex closed the stream (stderr may have details)") }
            buffer.append(chunk)
        }
    }
}
