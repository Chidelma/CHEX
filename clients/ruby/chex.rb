# CHEX client — drives the `chex` binary's persistent NDJSON loop.
#
# Stdlib only (open3, json). Requires the `chex` binary on PATH or an explicit
# path. One long-lived subprocess.
#
#   require_relative "chex"
#
#   CHEX.open do |c|
#     data = c.validate("./schemas/person.schema.json", { "name" => "Ada" })
#     data = c.validate("person", { "name" => "Ada" }, schema_dir: "./schemas")
#   end
#
# `validate` returns the validated data and raises CHEX::Error when it does not
# match the schema. Method names follow Ruby's snake_case. `request(op)` is a
# raw escape hatch returning the full response Hash.

require "open3"
require "json"

class CHEX
  class Error < StandardError; end

  def self.open(binary = "chex")
    c = new(binary)
    return c unless block_given?
    begin
      yield c
    ensure
      c.close
    end
  end

  def initialize(binary = "chex")
    @stdin, @stdout, @wait = Open3.popen2(binary, "exec", "--loop")
    @mutex = Mutex.new
  end

  # Send one raw machine-protocol op; return the full response Hash.
  def request(op)
    line = JSON.generate(op)
    reply = @mutex.synchronize do # ponytail: one call in flight; drop the lock only if you pipeline
      raise Error, "chex process has exited" unless @wait.alive?
      @stdin.puts(line)
      @stdout.gets
    end
    raise Error, "chex closed the stream (stderr may have details)" if reply.nil?
    JSON.parse(reply)
  end

  # Validate data against a schema (name or .schema.json path). Returns the
  # validated data; raises CHEX::Error if it does not match.
  def validate(schema, data, schema_dir: nil)
    op("validate", schema: schema, data: data, schemaDir: schema_dir)
  end

  def close
    return unless @wait.alive?
    @stdin.close
    @wait.join
  end

  private

  def op(name, **fields)
    payload = { "op" => name }
    fields.each { |k, v| payload[k.to_s] = v unless v.nil? }
    response = request(payload)
    raise Error, (response.dig("error", "message") || "chex error") unless response["ok"]
    response["result"]
  end
end
