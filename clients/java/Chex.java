// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// No dependencies (java.lang.Process only). Requires the `chex` binary on PATH
// or an explicit path. One long-lived subprocess.
//
//   try (Chex c = new Chex()) {
//       // data is a JSON object string (build it with Jackson/Gson)
//       String resp = c.validate("./schemas/person.schema.json", "{\"name\":\"Ada\"}", null);
//       String resp2 = c.validate("person", "{\"name\":\"Ada\"}", "./schemas");
//   }
//
// `validate` checks the response succeeded and returns the raw JSON response
// line (parse `result` with Jackson/Gson); it throws on a schema mismatch.
// Method names follow Java's camelCase. request(json) is the raw escape hatch.

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class Chex implements AutoCloseable {
    private final Process proc;
    private final BufferedWriter in;
    private final BufferedReader out;

    public Chex() throws IOException {
        this("chex");
    }

    public Chex(String binary) throws IOException {
        this.proc = new ProcessBuilder(List.of(binary, "exec", "--loop"))
                .redirectError(ProcessBuilder.Redirect.INHERIT)
                .start();
        this.in = new BufferedWriter(
                new OutputStreamWriter(proc.getOutputStream(), StandardCharsets.UTF_8));
        this.out = new BufferedReader(
                new InputStreamReader(proc.getInputStream(), StandardCharsets.UTF_8));
    }

    /** Send one raw machine-protocol op (JSON string); returns the response line. */
    public synchronized String request(String opJson) throws IOException {
        if (!proc.isAlive()) throw new IOException("chex process has exited");
        in.write(opJson.stripTrailing());
        in.write('\n');
        in.flush();
        String line = out.readLine();
        if (line == null) throw new IOException("chex closed the stream");
        return line;
    }

    /**
     * Validate a JSON object string against a schema (name or .schema.json path).
     * Pass schemaDir (or null) to resolve a name against a directory. Returns the
     * raw response line; throws on a schema mismatch.
     */
    public String validate(String schema, String dataJson, String schemaDir) throws IOException {
        StringBuilder sb = new StringBuilder("{\"op\":\"validate\",\"schema\":")
                .append(jsonString(schema))
                .append(",\"data\":").append(dataJson.strip());
        if (schemaDir != null) {
            sb.append(",\"schemaDir\":").append(jsonString(schemaDir));
        }
        String resp = request(sb.append('}').toString());
        if (!resp.contains("\"ok\":true")) throw new IOException(resp.strip());
        return resp;
    }

    // Minimal JSON string encoder.
    static String jsonString(String v) {
        return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @Override
    public void close() throws IOException {
        in.close(); // EOF ends the loop
        try {
            proc.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        out.close();
    }
}
