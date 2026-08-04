//! Narrow C ABI over the validator, for WebAssembly and for mobile FFI.
//!
//! No wasm-bindgen: `cargo build --target wasm32-unknown-unknown` emits a module
//! exporting these symbols directly, and the same symbols are what Swift/Kotlin
//! bind to in the `staticlib`/`cdylib` builds.
//!
//! Protocol — one JSON request in, one JSON response out:
//!
//!   request:  {"schema": {...}, "data": {...}, "label": "user.schema.json"}
//!   returns:  0 on success (no output), 1 on failure
//!   output:   {"name": "ValidationError", "message": "..."} — read via
//!             `chex_result_ptr()` / `chex_result_len()` after a `1`.
//!
//! Callers own the input buffer: `chex_alloc` it, write bytes, call, then
//! `chex_free` it. The result buffer is owned by the module and stays valid
//! until the next `chex_validate` call.

use std::cell::RefCell;

use serde_json::Value;

use crate::{ChexError, validate_inline};

/// Bumped on any breaking change to the symbols or the request/response shape.
const ABI_VERSION: u32 = 1;

const OK: i32 = 0;
const FAILED: i32 = 1;
const BAD_REQUEST: i32 = 2;

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Host/guest ABI version. Call this first and refuse to run on a mismatch.
#[unsafe(no_mangle)]
pub extern "C" fn chex_abi_version() -> u32 {
    ABI_VERSION
}

/// Allocate `length` bytes of guest memory for a host-to-guest copy.
#[unsafe(no_mangle)]
pub extern "C" fn chex_alloc(length: usize) -> *mut u8 {
    let mut bytes = Vec::<u8>::with_capacity(length);
    let pointer = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    pointer
}

/// Release memory returned by [`chex_alloc`].
///
/// # Safety
///
/// `pointer` must come from `chex_alloc(capacity)` and must not have been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chex_free(pointer: *mut u8, capacity: usize) {
    if pointer.is_null() || capacity == 0 {
        return;
    }
    // SAFETY: the ABI contract requires the original pointer and capacity.
    unsafe { drop(Vec::from_raw_parts(pointer, 0, capacity)) };
}

/// Validate a JSON request. Returns [`OK`], [`FAILED`], or [`BAD_REQUEST`];
/// for the latter two the message is in the result buffer.
///
/// # Safety
///
/// `pointer` must identify `length` readable bytes for the duration of the call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chex_validate(pointer: *const u8, length: usize) -> i32 {
    set_result(&[]);
    if pointer.is_null() {
        return write_error(&ChexError::plain("Request pointer is null"), BAD_REQUEST);
    }
    // SAFETY: the caller guarantees `length` readable bytes at `pointer`.
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };

    match run(bytes) {
        Ok(()) => OK,
        Err((error, code)) => write_error(&error, code),
    }
}

/// Pointer to the last result. Valid until the next [`chex_validate`].
#[unsafe(no_mangle)]
pub extern "C" fn chex_result_ptr() -> *const u8 {
    RESULT.with_borrow(|result| result.as_ptr())
}

/// Byte length of the last result.
#[unsafe(no_mangle)]
pub extern "C" fn chex_result_len() -> usize {
    RESULT.with_borrow(Vec::len)
}

fn run(bytes: &[u8]) -> Result<(), (ChexError, i32)> {
    let bad = |message: &str| (ChexError::plain(message), BAD_REQUEST);

    let request: Value =
        serde_json::from_slice(bytes).map_err(|_| bad("Request must be a JSON object"))?;
    let request = request
        .as_object()
        .ok_or_else(|| bad("Request must be a JSON object"))?;

    let schema = request
        .get("schema")
        .ok_or_else(|| bad("Request field \"schema\" is required"))?;
    let data = request
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| bad("Request field \"data\" must be an object"))?;
    let label = request
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or("schema");

    validate_inline(schema, data, label).map_err(|error| (error, FAILED))
}

fn write_error(error: &ChexError, code: i32) -> i32 {
    let body = serde_json::json!({ "name": error.name, "message": error.message });
    set_result(body.to_string().as_bytes());
    code
}

fn set_result(bytes: &[u8]) {
    RESULT.with_borrow_mut(|result| {
        result.clear();
        result.extend_from_slice(bytes);
    });
}
