//! Replay `tests/golden.json` against the built binary.
//!
//! The fixture was recorded from the JavaScript implementation before it was
//! removed, so this is what keeps the machine envelope — exit codes, error
//! names, and message wording — from drifting away from the published contract.
//!
//! Regenerating it requires the JS build, which no longer exists. Change a
//! golden entry only when the contract is deliberately changing, and say so in
//! the commit.

use std::process::Command;

use serde_json::Value;

#[test]
fn matches_the_recorded_envelopes() {
    let golden = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/golden.json"))
        .expect("tests/golden.json is missing");
    let cases: Vec<Value> = serde_json::from_str(&golden).expect("tests/golden.json is not JSON");
    assert!(!cases.is_empty(), "no golden cases to replay");

    let mut failures = Vec::new();

    for case in &cases {
        let argv: Vec<String> = case["argv"]
            .as_array()
            .expect("case is missing argv")
            .iter()
            .map(|value| value.as_str().unwrap_or_default().to_string())
            .collect();

        let output = Command::new(env!("CARGO_BIN_EXE_chex"))
            .args(&argv)
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .expect("failed to run the chex binary");

        let exit_code = output.status.code().unwrap_or(-1);
        let expected_code = case["exitCode"].as_i64().unwrap_or(-1);
        if i64::from(exit_code) != expected_code {
            failures.push(format!(
                "{argv:?}\n    exit code: got {exit_code}, want {expected_code}"
            ));
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let Ok(mut envelope) = serde_json::from_str::<Value>(&stdout) else {
            failures.push(format!("{argv:?}\n    stdout is not JSON: {stdout}"));
            continue;
        };
        if let Some(envelope) = envelope.as_object_mut() {
            envelope.remove("durationMs");
        }
        let mut expected = case["envelope"].clone();
        drop_parser_detail(&mut envelope);
        drop_parser_detail(&mut expected);

        if envelope != expected {
            failures.push(format!(
                "{argv:?}\n    got:  {envelope}\n    want: {expected}"
            ));
        }
    }

    assert!(
        failures.is_empty(),
        "{} of {} golden cases differ:\n\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n\n")
    );
}

/// `Invalid JSON input: <detail>` carries the underlying parser's own wording.
/// The prefix is CHEX's contract; the detail is JavaScriptCore's or serde_json's
/// and was never promised to callers, so both sides are compared without it.
fn drop_parser_detail(envelope: &mut Value) {
    const PREFIX: &str = "Invalid JSON input";
    let Some(message) = envelope.pointer_mut("/error/message") else {
        return;
    };
    if message
        .as_str()
        .is_some_and(|text| text.starts_with(PREFIX))
    {
        *message = Value::String(PREFIX.to_string());
    }
}
