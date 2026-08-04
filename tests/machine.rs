//! Machine-interface tests: the `exec` envelope and the NDJSON loop.
//!
//! Ported from `tests/unit/cli.test.js`. The JavaScript build could import
//! `executeMachineOperation` and `serveStdioLoop` directly; here the equivalent
//! surface is the binary, so these drive it over argv and stdin.

use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::{Value, json};

fn schema_dir() -> String {
    format!("{}/examples/valid", env!("CARGO_MANIFEST_DIR"))
}

fn schema_path(name: &str) -> String {
    format!("{}/{name}.schema.json", schema_dir())
}

fn valid_measure() -> Value {
    json!({ "score": "100", "temperature": "25", "quantity": "10", "username": "alice", "code": "AB12" })
}

/// Run `chex exec --request <json>` and parse the response envelope.
fn exec(request: &Value) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_chex"))
        .args(["exec", "--request", &request.to_string()])
        .output()
        .expect("failed to run the chex binary");
    serde_json::from_slice(&output.stdout).expect("exec did not emit a JSON envelope")
}

/// Feed lines to `chex exec --loop` and collect one envelope per response line.
fn loop_responses(lines: &[String]) -> Vec<Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_chex"))
        .args(["exec", "--loop"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("failed to spawn the chex binary");

    {
        let stdin = child.stdin.as_mut().expect("stdin was not piped");
        for line in lines {
            writeln!(stdin, "{line}").expect("failed to write a request line");
        }
    }

    let output = child.wait_with_output().expect("the loop did not exit");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("a response line was not JSON"))
        .collect()
}

#[test]
fn answers_ndjson_requests_in_order_one_response_per_line() {
    let responses = loop_responses(&[
        json!({
            "requestId": "ok",
            "op": "validate",
            "schemaPath": schema_path("measure"),
            "data": valid_measure(),
        })
        .to_string(),
        json!({
            "requestId": "bad",
            "op": "validate",
            "schemaPath": schema_path("measure"),
            "data": { "score": "nope" },
        })
        .to_string(),
        "not json".to_string(),
    ]);

    assert_eq!(responses.len(), 3);
    assert_eq!(responses[0]["ok"], json!(true));
    assert_eq!(responses[0]["requestId"], json!("ok"));
    assert_eq!(responses[1]["ok"], json!(false));
    assert_eq!(responses[1]["requestId"], json!("bad"));
    // An unparseable line still yields an error envelope rather than killing the loop.
    assert_eq!(responses[2]["ok"], json!(false));
}

#[test]
fn executes_validation_requests() {
    let envelope = exec(&json!({
        "requestId": "validate-1",
        "op": "validate",
        "schemaPath": schema_path("measure"),
        "data": valid_measure(),
    }));

    assert_eq!(envelope["ok"], json!(true));
    assert_eq!(envelope["protocolVersion"], json!(1));
    assert_eq!(envelope["op"], json!("validate"));
    assert_eq!(envelope["requestId"], json!("validate-1"));
    assert_eq!(envelope["result"]["score"], json!("100"));
}

#[test]
fn executes_validation_requests_by_schema_name_and_directory() {
    let envelope = exec(&json!({
        "requestId": "validate-by-name",
        "op": "validate",
        "schema": "measure",
        "schemaDir": schema_dir(),
        "data": valid_measure(),
    }));

    assert_eq!(envelope["ok"], json!(true));
    assert_eq!(envelope["result"]["score"], json!("100"));
}

#[test]
fn returns_structured_validation_errors() {
    let envelope = exec(&json!({
        "requestId": "bad-validate",
        "op": "validate",
        "schemaPath": schema_path("status"),
        "data": { "direction": "northwest", "priority": "2", "label": "active", "tag": null },
    }));

    assert_eq!(envelope["ok"], json!(false));
    assert_eq!(envelope["requestId"], json!("bad-validate"));
    assert_eq!(envelope["error"]["name"], json!("ValidationError"));
    let message = envelope["error"]["message"].as_str().unwrap_or_default();
    assert!(
        message.contains("RegEx pattern fails for property 'direction'"),
        "unexpected message: {message}"
    );
}

#[test]
fn rejects_unsupported_operations_through_the_machine_interface() {
    let envelope = exec(&json!({ "op": "unknownOperation" }));

    assert_eq!(envelope["ok"], json!(false));
    let message = envelope["error"]["message"].as_str().unwrap_or_default();
    assert_eq!(
        message,
        "Unsupported machine operation \"unknownOperation\""
    );
}
