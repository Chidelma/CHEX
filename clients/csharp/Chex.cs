// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// No NuGet dependencies (System.Text.Json ships with .NET). Requires the `chex`
// binary on PATH or an explicit path. One long-lived subprocess.
//
//   using var c = new Chex();
//   JsonElement data = c.Validate("./schemas/person.schema.json", new { name = "Ada" });
//   JsonElement data2 = c.Validate("person", new { name = "Ada" }, "./schemas");
//
// `Validate` returns the validated data as a JsonElement and throws
// ChexException when it does not match the schema. Method names follow .NET
// PascalCase. Request(json) is the raw escape hatch returning the full response.

using System;
using System.Diagnostics;
using System.Text.Json;

namespace Chex
{
    public sealed class ChexException : Exception
    {
        public ChexException(string message) : base(message) { }
    }

    public sealed class Chex : IDisposable
    {
        private readonly Process _proc;
        private readonly object _lock = new object();

        public Chex(string binary = "chex")
        {
            var psi = new ProcessStartInfo
            {
                FileName = binary,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
            };
            psi.ArgumentList.Add("exec");
            psi.ArgumentList.Add("--loop");
            _proc = Process.Start(psi) ?? throw new InvalidOperationException("failed to start chex");
        }

        /// <summary>Send one raw machine-protocol op (JSON string); returns the full response.</summary>
        public JsonDocument Request(string opJson)
        {
            lock (_lock) // ponytail: one call in flight; drop the lock only if you pipeline
            {
                if (_proc.HasExited) throw new InvalidOperationException("chex process has exited");
                _proc.StandardInput.Write(opJson.TrimEnd());
                _proc.StandardInput.Write('\n');
                _proc.StandardInput.Flush();
                string? line = _proc.StandardOutput.ReadLine();
                if (line == null) throw new InvalidOperationException("chex closed the stream");
                return JsonDocument.Parse(line);
            }
        }

        // Send a fully-formed op JSON and return `result`, throwing on failure.
        private JsonElement Op(string opJson)
        {
            using JsonDocument doc = Request(opJson);
            JsonElement root = doc.RootElement;
            if (!root.GetProperty("ok").GetBoolean())
            {
                string msg = root.TryGetProperty("error", out var e) &&
                             e.TryGetProperty("message", out var m)
                    ? m.GetString() ?? "chex error"
                    : "chex error";
                throw new ChexException(msg);
            }
            return root.TryGetProperty("result", out var r) ? r.Clone() : default;
        }

        /// <summary>Validate data against a schema (name or .schema.json path). Returns the validated data.</summary>
        public JsonElement Validate(string schema, object data, string? schemaDir = null)
        {
            var op = new
            {
                op = "validate",
                schema,
                data,
                schemaDir,
            };
            // Omit null schemaDir so a name resolves the same as on the CLI.
            var opts = new JsonSerializerOptions { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };
            return Op(JsonSerializer.Serialize(op, opts));
        }

        public void Dispose()
        {
            if (!_proc.HasExited)
            {
                _proc.StandardInput.Close(); // EOF ends the loop
                _proc.WaitForExit(30_000);
            }
            _proc.Dispose();
        }
    }
}
