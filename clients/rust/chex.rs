//! CHEX client — drives the `chex` binary's persistent NDJSON loop.
//!
//! std only. Requires the `chex` binary on PATH or an explicit path. One
//! long-lived subprocess. `validate` takes the data as a JSON object string
//! (bring serde_json to build it) and returns the raw response line (also JSON).
//!
//!   let mut c = Chex::open("chex")?;
//!   let resp = c.validate("./schemas/person.schema.json", r#"{"name":"Ada"}"#, None)?;
//!   let resp = c.validate("person", r#"{"name":"Ada"}"#, Some("./schemas"))?;
//!
//! `request` is the raw escape hatch for other ops.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};

pub struct Chex {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<std::process::ChildStdout>,
}

impl Chex {
    /// Start a warm chex process. `binary` is usually "chex".
    pub fn open(binary: &str) -> std::io::Result<Chex> {
        let mut child = Command::new(binary)
            .args(["exec", "--loop"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let stdin = child.stdin.take().expect("stdin piped");
        let stdout = BufReader::new(child.stdout.take().expect("stdout piped"));
        Ok(Chex { child, stdin: Some(stdin), stdout })
    }

    /// Send one machine-protocol op (a JSON object string) and return the response line.
    pub fn request(&mut self, op_json: &str) -> std::io::Result<String> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "chex closed"))?;
        stdin.write_all(op_json.trim_end().as_bytes())?;
        stdin.write_all(b"\n")?;
        stdin.flush()?;
        let mut line = String::new();
        if self.stdout.read_line(&mut line)? == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "chex closed the stream",
            ));
        }
        Ok(line)
    }

    // Send a fully-formed op JSON and error on a failure response.
    // ponytail: checks the always-present "ok":true field by substring.
    fn checked(&mut self, json: String) -> std::io::Result<String> {
        let resp = self.request(&json)?;
        if !resp.contains("\"ok\":true") {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, resp.trim().to_string()));
        }
        Ok(resp)
    }

    /// Validate `data_json` (a JSON object string) against `schema` (name or path).
    /// Pass `schema_dir` to resolve a name against a directory.
    pub fn validate(
        &mut self,
        schema: &str,
        data_json: &str,
        schema_dir: Option<&str>,
    ) -> std::io::Result<String> {
        let mut op = format!(r#"{{"op":"validate","schema":"{}","data":{}"#, esc(schema), data_json.trim());
        if let Some(dir) = schema_dir {
            op.push_str(&format!(r#","schemaDir":"{}""#, esc(dir)));
        }
        op.push('}');
        self.checked(op)
    }

    /// End the loop and wait for the process to exit.
    pub fn close(mut self) -> std::io::Result<()> {
        self.stdin.take(); // drop stdin → EOF ends the loop
        self.child.wait().map(|_| ())
    }
}

/// Escape a string for embedding in a JSON string literal.
fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}
