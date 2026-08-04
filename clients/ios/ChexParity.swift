// Smoke test for the C ABI binding in Chex.swift.
//
// Chex.swift calls the same engine the binary does, so the validation rules
// can't disagree — what this checks is the binding: request marshalling, the
// result buffer, and error decoding. It runs a battery of cases through both and
// asserts they agree on accept/reject.
//
//   swiftc -import-objc-header include/chex.h \
//     clients/ios/Chex.swift clients/ios/ChexParity.swift \
//     -L target/release -lchex -o /tmp/chex-ios
//   /tmp/chex-ios ./target/release/chex
//
// Exits 0 when every case matches, 1 otherwise. Foundation only.

import Foundation

struct ParityCase {
    let name: String
    let schema: String
    let data: String
    let valid: Bool
}

let cases: [ParityCase] = [
    ParityCase(name: "primitive pass", schema: #"{"age":"^[0-9]+$"}"#, data: #"{"age":30}"#, valid: true),
    ParityCase(name: "primitive fail", schema: #"{"age":"^[0-9]+$"}"#, data: #"{"age":"x"}"#, valid: false),
    ParityCase(name: "boolean coercion", schema: #"{"active":"^(true|false)$"}"#, data: #"{"active":true}"#, valid: true),
    ParityCase(name: "nullable absent", schema: #"{"nickname?":"^[a-z]+$"}"#, data: #"{}"#, valid: true),
    ParityCase(name: "nullable present ok", schema: #"{"nickname?":"^[a-z]+$"}"#, data: #"{"nickname":"ada"}"#, valid: true),
    ParityCase(name: "nullable present bad", schema: #"{"nickname?":"^[a-z]+$"}"#, data: #"{"nickname":"A1"}"#, valid: false),
    ParityCase(name: "missing required", schema: #"{"age":"^[0-9]+$"}"#, data: #"{}"#, valid: false),
    ParityCase(name: "unknown property", schema: #"{"age":"^[0-9]+$"}"#, data: #"{"age":1,"extra":"x"}"#, valid: false),
    ParityCase(name: "nested object ok", schema: #"{"addr":{"city":"^[A-Za-z]+$"}}"#, data: #"{"addr":{"city":"Lagos"}}"#, valid: true),
    ParityCase(name: "nested object bad", schema: #"{"addr":{"city":"^[A-Za-z]+$"}}"#, data: #"{"addr":{"city":"L4"}}"#, valid: false),
    ParityCase(name: "object type mismatch", schema: #"{"addr":{"city":"^[A-Za-z]+$"}}"#, data: #"{"addr":"x"}"#, valid: false),
    ParityCase(name: "scalar array ok", schema: #"{"tags":["^[a-z]+$"]}"#, data: #"{"tags":["bun","web"]}"#, valid: true),
    ParityCase(name: "scalar array bad", schema: #"{"tags":["^[a-z]+$"]}"#, data: #"{"tags":["bun","W1"]}"#, valid: false),
    ParityCase(name: "array type mismatch", schema: #"{"tags":["^[a-z]+$"]}"#, data: #"{"tags":"nope"}"#, valid: false),
    ParityCase(name: "array of objects ok", schema: #"{"items":[{"sku":"^[A-Z0-9-]+$","gift?":"^(true|false)$"}]}"#, data: #"{"items":[{"sku":"AB-1"},{"sku":"CD-2","gift":true}]}"#, valid: true),
    ParityCase(name: "array of objects bad", schema: #"{"items":[{"sku":"^[A-Z0-9-]+$"}]}"#, data: #"{"items":[{"sku":"ab-1"}]}"#, valid: false),
    ParityCase(name: "record ok", schema: #"{"meta":{"^[a-z_]+$":"^.+$"}}"#, data: #"{"meta":{"a_b":"x"}}"#, valid: true),
    ParityCase(name: "record bad key", schema: #"{"meta":{"^[a-z_]+$":"^.+$"}}"#, data: #"{"meta":{"A":"x"}}"#, valid: false),
    ParityCase(name: "record bad value", schema: #"{"meta":{"^[a-z]+$":"^[0-9]+$"}}"#, data: #"{"meta":{"a":"x"}}"#, valid: false),
]

func inProcessAccepts(_ schemaJson: String, _ dataJson: String) -> Bool {
    guard let schema = (try? JSONSerialization.jsonObject(with: Data(schemaJson.utf8))) as? [String: Any],
          let data = (try? JSONSerialization.jsonObject(with: Data(dataJson.utf8))) as? [String: Any] else {
        return false
    }
    do { _ = try CHEXValidator.validate(schema, data); return true } catch { return false }
}

var counter = 0
func binaryAccepts(_ bin: String, _ dir: URL, _ schemaJson: String, _ dataJson: String) -> Bool {
    let file = dir.appendingPathComponent("s\(counter).schema.json")
    counter += 1
    try? schemaJson.write(to: file, atomically: true, encoding: .utf8)
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    proc.arguments = [bin, "validate", file.path, dataJson]
    proc.standardOutput = Pipe()
    proc.standardError = Pipe()
    do { try proc.run() } catch { return false }
    proc.waitUntilExit()
    return proc.terminationStatus == 0
}

@main
struct ChexParityMain {
    static func main() {
        let bin = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "chex"
        let dir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("chex-ios-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var failures = 0
        for testCase in cases {
            let oracle = binaryAccepts(bin, dir, testCase.schema, testCase.data)
            let inProc = inProcessAccepts(testCase.schema, testCase.data)
            if !(oracle == testCase.valid && inProc == oracle) {
                failures += 1
                FileHandle.standardError.write("MISMATCH \(testCase.name): expected=\(testCase.valid) binary=\(oracle) inProcess=\(inProc)\n".data(using: .utf8)!)
            }
        }
        try? FileManager.default.removeItem(at: dir)
        if failures == 0 {
            print("parity OK: \(cases.count) cases agree with the chex binary")
        } else {
            FileHandle.standardError.write("\(failures)/\(cases.count) cases FAILED\n".data(using: .utf8)!)
            exit(1)
        }
    }
}
