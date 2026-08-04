//! `chex` command line interface.
//!
//! Every command writes the same machine envelope the pre-26.28 JS build wrote,
//! so language shims are unaffected by the port to Rust.

use std::io::{BufRead, Read, Write};
use std::time::Instant;

use chex::{ChexError, SchemaValidator};
use serde_json::{Map, Value, json};

const MACHINE_PROTOCOL_VERSION: u32 = 1;

const HELP: &str = r#"chex — regex-driven JSON schema validation

Usage:
  chex validate <schema|schema-path> <json|@path|-> [--schema-dir <path>]
  chex exec --request <json|@path|->
  chex exec --loop

Options:
  --schema-dir <path>  Resolve the schema argument as <path>/<schema>.schema.json
  --request <value>    Machine request payload, @file path, or - for stdin
  --loop               Persistent NDJSON loop: one request/response per line on stdio
  -h, --help           Show this help and exit

Machine request:
  {"op":"validate","schemaPath":"./schemas/person.schema.json","data":{...}}

All commands write structured JSON to stdout."#;

fn main() {
    let started_at = Instant::now();
    let args = std::env::args().skip(1).collect::<Vec<_>>();

    match run(&args, started_at) {
        Ok(exit) => std::process::exit(exit),
        Err((request, error)) => {
            println!("{:#}", error_response(request.as_ref(), started_at, &error));
            std::process::exit(1);
        }
    }
}

type Failure = (Option<Value>, ChexError);

fn run(args: &[String], started_at: Instant) -> Result<i32, Failure> {
    let parsed = ParsedArgs::parse(args).map_err(|error| (None, error))?;

    if parsed.help || parsed.positionals.is_empty() {
        println!("{HELP}");
        return Ok(i32::from(!parsed.help));
    }

    if parsed.positionals[0] == "exec" && parsed.loop_mode {
        serve_stdio_loop();
        return Ok(0);
    }

    let request = parsed.build_request().map_err(|error| (None, error))?;
    let result = execute(&request).map_err(|error| (Some(request.clone()), error))?;
    println!("{:#}", success_response(Some(&request), started_at, result));
    Ok(0)
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

struct ParsedArgs {
    positionals: Vec<String>,
    schema_dir: Option<String>,
    request: Option<String>,
    loop_mode: bool,
    help: bool,
}

impl ParsedArgs {
    fn parse(argv: &[String]) -> chex::Result<Self> {
        let mut parsed = Self {
            positionals: Vec::new(),
            schema_dir: None,
            request: None,
            loop_mode: false,
            help: false,
        };

        let mut index = 0;
        while index < argv.len() {
            let arg = argv[index].as_str();
            match arg {
                "--schema-dir" => {
                    let value = argv
                        .get(index + 1)
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| ChexError::plain("Missing value for --schema-dir"))?;
                    parsed.schema_dir = Some(resolve_path(value));
                    index += 1;
                }
                "--request" => {
                    let value = argv
                        .get(index + 1)
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| ChexError::plain("Missing value for --request"))?;
                    parsed.request = Some(value.clone());
                    index += 1;
                }
                "--loop" => parsed.loop_mode = true,
                "--help" | "-h" => parsed.help = true,
                _ => parsed.positionals.push(arg.to_string()),
            }
            index += 1;
        }
        Ok(parsed)
    }

    fn build_request(&self) -> chex::Result<Value> {
        let command = self
            .positionals
            .first()
            .map(String::as_str)
            .unwrap_or_default();

        if command == "exec" {
            let request = self
                .request
                .as_deref()
                .ok_or_else(|| ChexError::plain("Missing --request for exec"))?;
            return read_json(request);
        }

        if command == "validate" {
            let schema = self
                .positionals
                .get(1)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| ChexError::plain("Missing schema for validate"))?;
            let source = self
                .positionals
                .get(2)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| ChexError::plain("Missing JSON data input for validate"))?;
            let data = read_json(source)?;

            let uses_schema_path = self.schema_dir.is_none() && looks_like_path(schema);
            let mut request = Map::new();
            request.insert("op".into(), json!("validate"));
            if let Some(dir) = &self.schema_dir {
                request.insert("schemaDir".into(), json!(dir));
            }
            let field = if uses_schema_path {
                "schemaPath"
            } else {
                "schema"
            };
            request.insert(field.into(), json!(schema));
            request.insert("data".into(), data);
            return Ok(Value::Object(request));
        }

        Err(ChexError::plain(format!(
            "Unsupported command \"{command}\""
        )))
    }
}

fn looks_like_path(value: &str) -> bool {
    value.contains('/') || value.contains('\\') || value.to_lowercase().ends_with(".schema.json")
}

/// Lexical `path.resolve` — join with the cwd, no filesystem access.
fn resolve_path(value: &str) -> String {
    std::path::absolute(value)
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| value.to_string())
}

/// Read a `<json|@path|->` argument.
fn read_json(source: &str) -> chex::Result<Value> {
    let text = if source == "-" {
        let mut buffer = String::new();
        std::io::stdin()
            .read_to_string(&mut buffer)
            .map_err(|_| ChexError::plain("JSON input requires <json|@path|->"))?;
        buffer
    } else if let Some(path) = source.strip_prefix('@') {
        std::fs::read_to_string(path)
            .map_err(|error| ChexError::plain(format!("Invalid JSON input: {error}")))?
    } else {
        source.to_string()
    };

    serde_json::from_str(&text)
        .map_err(|error| ChexError::plain(format!("Invalid JSON input: {error}")))
}

// ---------------------------------------------------------------------------
// Machine protocol
// ---------------------------------------------------------------------------

fn execute(request: &Value) -> chex::Result<Value> {
    let request = request
        .as_object()
        .ok_or_else(|| ChexError::plain("Machine request body must be a JSON object"))?;

    let Some(Value::String(op)) = request.get("op") else {
        return Err(ChexError::plain(
            "Machine request field \"op\" must be a string",
        ));
    };
    if op != "validate" {
        return Err(ChexError::plain(format!(
            "Unsupported machine operation \"{op}\""
        )));
    }

    let data = request
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| ChexError::plain("Machine request field \"data\" must be an object"))?;

    let non_empty = |field: &str| {
        request
            .get(field)
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
    };

    let schema_ref = non_empty("schemaPath")
        .or_else(|| non_empty("schema"))
        .or_else(|| non_empty("collection"))
        .ok_or_else(|| {
            ChexError::plain("Machine request field \"collection\" must be a non-empty string")
        })?;

    let mut validator = SchemaValidator::new(non_empty("schemaPath"), non_empty("schemaDir"));
    validator.validate(&schema_ref, data)?;
    Ok(Value::Object(data.clone()))
}

fn envelope_op(request: Option<&Value>) -> Value {
    let is_validate = request
        .and_then(Value::as_object)
        .and_then(|request| request.get("op"))
        .and_then(Value::as_str)
        == Some("validate");
    if is_validate {
        json!("validate")
    } else {
        Value::Null
    }
}

fn envelope_request_id(request: Option<&Value>) -> Value {
    request
        .and_then(Value::as_object)
        .and_then(|request| request.get("requestId"))
        .filter(|value| value.is_string())
        .cloned()
        .unwrap_or(Value::Null)
}

fn success_response(request: Option<&Value>, started_at: Instant, result: Value) -> Value {
    json!({
        "protocolVersion": MACHINE_PROTOCOL_VERSION,
        "ok": true,
        "op": "validate",
        "requestId": envelope_request_id(request),
        "durationMs": u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX),
        "result": result,
    })
}

fn error_response(request: Option<&Value>, started_at: Instant, error: &ChexError) -> Value {
    json!({
        "protocolVersion": MACHINE_PROTOCOL_VERSION,
        "ok": false,
        "op": envelope_op(request),
        "requestId": envelope_request_id(request),
        "durationMs": u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX),
        "error": { "name": error.name, "message": error.message },
    })
}

/// Persistent NDJSON loop: one JSON request per line in, one response per line
/// out, in order. Keeps the process warm so shims pay startup once.
fn serve_stdio_loop() {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let started_at = Instant::now();
        let response = match serde_json::from_str::<Value>(trimmed) {
            Err(_) => error_response(None, started_at, &ChexError::plain("Invalid JSON request")),
            Ok(request) => match execute(&request) {
                Ok(result) => success_response(Some(&request), started_at, result),
                Err(error) => error_response(Some(&request), started_at, &error),
            },
        };
        let _ = writeln!(out, "{response}");
        let _ = out.flush();
    }
}
