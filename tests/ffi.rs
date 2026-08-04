//! C ABI tests — the surface `chex.wasm`, the iOS client, and the Flutter client
//! all go through.
//!
//! Replaces `tests/unit/web-client.test.js`. That test existed to keep a
//! hand-written JavaScript validator in step with the engine; the browser now
//! runs the engine itself, so what is worth testing is the boundary: allocation,
//! request decoding, and the error buffer. The 19-case battery is carried over
//! unchanged, and the language client harnesses in `scripts/verify-clients.mjs`
//! run the same cases across the FFI.

use chex::ffi::{
    chex_abi_version, chex_alloc, chex_free, chex_result_len, chex_result_ptr, chex_validate,
};
use serde_json::{Value, json};

const OK: i32 = 0;
const FAILED: i32 = 1;
const BAD_REQUEST: i32 = 2;

/// Copy `request` through the ABI's own allocator and validate it.
fn call(request: &str) -> i32 {
    let bytes = request.as_bytes();
    // SAFETY: the pointer comes from chex_alloc and is freed once, below.
    unsafe {
        let buffer = chex_alloc(bytes.len());
        assert!(!buffer.is_null(), "chex_alloc returned null");
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), buffer, bytes.len());
        let code = chex_validate(buffer, bytes.len());
        chex_free(buffer, bytes.len());
        code
    }
}

/// Read whatever the last call left in the result buffer.
fn last_result() -> Option<Value> {
    let length = chex_result_len();
    if length == 0 {
        return None;
    }
    // SAFETY: the buffer is valid until the next chex_validate on this thread.
    let bytes = unsafe { std::slice::from_raw_parts(chex_result_ptr(), length) };
    serde_json::from_slice(bytes).ok()
}

fn validate(schema: &Value, data: &Value) -> i32 {
    call(&json!({ "schema": schema, "data": data, "label": "test" }).to_string())
}

#[test]
fn reports_its_abi_version() {
    assert_eq!(chex_abi_version(), 1);
}

/// The same battery the Swift, Kotlin, and Dart harnesses run, as raw JSON so
/// each case stays on one line.
const CASES: &[(&str, &str, &str, bool)] = &[
    (
        "primitive pass",
        r#"{"age":"^[0-9]+$"}"#,
        r#"{"age":30}"#,
        true,
    ),
    (
        "primitive fail",
        r#"{"age":"^[0-9]+$"}"#,
        r#"{"age":"x"}"#,
        false,
    ),
    (
        "boolean coercion",
        r#"{"active":"^(true|false)$"}"#,
        r#"{"active":true}"#,
        true,
    ),
    (
        "nullable absent",
        r#"{"nickname?":"^[a-z]+$"}"#,
        r#"{}"#,
        true,
    ),
    (
        "nullable present ok",
        r#"{"nickname?":"^[a-z]+$"}"#,
        r#"{"nickname":"ada"}"#,
        true,
    ),
    (
        "nullable present bad",
        r#"{"nickname?":"^[a-z]+$"}"#,
        r#"{"nickname":"A1"}"#,
        false,
    ),
    ("missing required", r#"{"age":"^[0-9]+$"}"#, r#"{}"#, false),
    (
        "unknown property",
        r#"{"age":"^[0-9]+$"}"#,
        r#"{"age":1,"extra":"x"}"#,
        false,
    ),
    (
        "nested object ok",
        r#"{"addr":{"city":"^[A-Za-z]+$"}}"#,
        r#"{"addr":{"city":"Lagos"}}"#,
        true,
    ),
    (
        "nested object bad",
        r#"{"addr":{"city":"^[A-Za-z]+$"}}"#,
        r#"{"addr":{"city":"L4"}}"#,
        false,
    ),
    (
        "object type mismatch",
        r#"{"addr":{"city":"^[A-Za-z]+$"}}"#,
        r#"{"addr":"x"}"#,
        false,
    ),
    (
        "scalar array ok",
        r#"{"tags":["^[a-z]+$"]}"#,
        r#"{"tags":["bun","web"]}"#,
        true,
    ),
    (
        "scalar array bad",
        r#"{"tags":["^[a-z]+$"]}"#,
        r#"{"tags":["bun","W1"]}"#,
        false,
    ),
    (
        "array type mismatch",
        r#"{"tags":["^[a-z]+$"]}"#,
        r#"{"tags":"nope"}"#,
        false,
    ),
    (
        "array of objects ok",
        r#"{"items":[{"sku":"^[A-Z0-9-]+$","gift?":"^(true|false)$"}]}"#,
        r#"{"items":[{"sku":"AB-1"},{"sku":"CD-2","gift":true}]}"#,
        true,
    ),
    (
        "array of objects bad",
        r#"{"items":[{"sku":"^[A-Z0-9-]+$"}]}"#,
        r#"{"items":[{"sku":"ab-1"}]}"#,
        false,
    ),
    (
        "record ok",
        r#"{"meta":{"^[a-z_]+$":"^.+$"}}"#,
        r#"{"meta":{"a_b":"x"}}"#,
        true,
    ),
    (
        "record bad key",
        r#"{"meta":{"^[a-z_]+$":"^.+$"}}"#,
        r#"{"meta":{"A":"x"}}"#,
        false,
    ),
    (
        "record bad value",
        r#"{"meta":{"^[a-z]+$":"^[0-9]+$"}}"#,
        r#"{"meta":{"a":"x"}}"#,
        false,
    ),
];

#[test]
fn accepts_and_rejects_the_shared_case_battery() {
    for (name, schema, data, valid) in CASES {
        let code = call(&format!(
            r#"{{"schema":{schema},"data":{data},"label":"test"}}"#
        ));
        assert_eq!(
            code == OK,
            *valid,
            "{name}: expected valid={valid}, got code {code}"
        );
    }
}

#[test]
fn leaves_no_result_on_success() {
    assert_eq!(
        validate(&json!({"age": "^[0-9]+$"}), &json!({"age": 7})),
        OK
    );
    assert_eq!(
        chex_result_len(),
        0,
        "a passing call should write no result"
    );
}

#[test]
fn reports_the_engine_error_class_and_message() {
    assert_eq!(
        validate(&json!({"age": "^[0-9]+$"}), &json!({"age": "x"})),
        FAILED
    );
    let result = last_result().expect("a failure should leave a result");
    assert_eq!(result["name"], json!("ValidationError"));
    assert_eq!(
        result["message"],
        json!("RegEx pattern fails for property 'age' in schema 'test'")
    );
}

#[test]
fn rejects_unsupported_regex_syntax_at_load_time() {
    // Lookahead is deliberately unsupported: the engine is backtracking-free.
    assert_eq!(
        validate(&json!({"code": "^(?=.*[A-Z]).+$"}), &json!({"code": "A"})),
        FAILED
    );
    let result = last_result().expect("a failure should leave a result");
    assert_eq!(result["name"], json!("ValidationError"));
    assert_eq!(
        result["message"],
        json!("Invalid RegEx pattern for 'code' in schema 'test'")
    );
}

#[test]
fn distinguishes_a_malformed_request_from_a_validation_failure() {
    for request in [
        "not json",
        "[]",
        r#"{"data":{}}"#,
        r#"{"schema":{"a":"^b$"}}"#,
        r#"{"schema":{"a":"^b$"},"data":[]}"#,
    ] {
        assert_eq!(
            call(request),
            BAD_REQUEST,
            "request should be rejected: {request}"
        );
        assert!(
            last_result().is_some(),
            "a rejection should explain itself: {request}"
        );
    }
}

#[test]
fn defaults_the_label_when_the_request_omits_it() {
    assert_eq!(
        call(r#"{"schema":{"age":"^[0-9]+$"},"data":{"age":"x"}}"#),
        FAILED
    );
    let result = last_result().expect("a failure should leave a result");
    assert_eq!(
        result["message"],
        json!("RegEx pattern fails for property 'age' in schema 'schema'")
    );
}

#[test]
fn a_null_pointer_is_a_bad_request_rather_than_a_crash() {
    // SAFETY: a null pointer with zero length is the documented rejection path.
    let code = unsafe { chex_validate(std::ptr::null(), 0) };
    assert_eq!(code, BAD_REQUEST);
}

#[test]
fn freeing_a_null_or_empty_allocation_is_a_no_op() {
    // SAFETY: both arguments are the documented no-op cases.
    unsafe {
        chex_free(std::ptr::null_mut(), 0);
        let buffer = chex_alloc(8);
        chex_free(buffer, 0);
        chex_free(buffer, 8);
    }
}
