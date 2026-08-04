//! JNI entry point for Android and the desktop JVM.
//!
//! Android can't call the plain C ABI in [`crate::ffi`] — the JVM needs symbols
//! shaped `Java_<package>_<class>_<method>`, so the Kotlin client's class must
//! live in package `dev.chex`.
//!
//! One JSON request in, and either `null` for a pass or `name`+U+001F+`message`
//! for a failure. That is not JSON because, unlike Swift and
//! Dart, a dependency-free JVM client has no JSON decoder to read it with, and
//! the JNI layer is a separate entry point anyway.
//!
//! Built only with `--features jni-bindings`, so wasm and the CLI never see the
//! `jni` crate.

use jni::JNIEnv;
use jni::objects::{JObject, JString};
use jni::sys::jstring;
use serde_json::Value;

use crate::{ChexError, validate_inline};

/// `dev.chex.Chex.nativeValidate(String): String?`
///
/// Declared on a Kotlin `object`, so the second argument is the singleton
/// instance rather than the class. Either way it goes unused.
#[unsafe(no_mangle)]
pub extern "system" fn Java_dev_chex_Chex_nativeValidate<'local>(
    mut env: JNIEnv<'local>,
    _this: JObject<'local>,
    request: JString<'local>,
) -> jstring {
    let null = std::ptr::null_mut();

    let Ok(request) = env.get_string(&request) else {
        return error_string(&mut env, &ChexError::plain("Request must be a JSON string"));
    };
    let request: String = request.into();

    match run(&request) {
        Ok(()) => null,
        Err(error) => error_string(&mut env, &error),
    }
}

fn run(request: &str) -> Result<(), ChexError> {
    let request: Value = serde_json::from_str(request)
        .map_err(|_| ChexError::plain("Request must be a JSON object"))?;
    let request = request
        .as_object()
        .ok_or_else(|| ChexError::plain("Request must be a JSON object"))?;

    let schema = request
        .get("schema")
        .ok_or_else(|| ChexError::plain("Request field \"schema\" is required"))?;
    let data = request
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| ChexError::plain("Request field \"data\" must be an object"))?;
    let label = request
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or("schema");

    validate_inline(schema, data, label)
}

fn error_string(env: &mut JNIEnv<'_>, error: &ChexError) -> jstring {
    let body = format!("{}\u{1f}{}", error.name, error.message);
    // A failed allocation leaves a pending JVM exception; null is the correct
    // return in that case and the JVM raises it as soon as we hand control back.
    env.new_string(body)
        .map_or_else(|_| std::ptr::null_mut(), jni::objects::JString::into_raw)
}
