<?php
// CHEX client — drives the `chex` binary's persistent NDJSON loop.
//
// ext-json only. Requires the `chex` binary on PATH or an explicit path. One
// long-lived subprocess.
//
//   require 'chex.php';
//   $c = new CHEX();
//   $data = $c->validate('./schemas/person.schema.json', ['name' => 'Ada']);
//   $data = $c->validate('person', ['name' => 'Ada'], './schemas');
//   $c->close();
//
// `validate` returns the validated data and throws CHEXException when it does
// not match the schema. Method names follow PHP's camelCase. request($op) is a
// raw escape hatch returning the full response array.

class CHEXException extends RuntimeException {}

class CHEX
{
    private $proc;
    private $stdin;
    private $stdout;

    public function __construct(string $binary = 'chex')
    {
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => STDERR];
        $this->proc = proc_open([$binary, 'exec', '--loop'], $spec, $pipes);
        if (!is_resource($this->proc)) {
            throw new CHEXException('failed to start chex process');
        }
        $this->stdin = $pipes[0];
        $this->stdout = $pipes[1];
    }

    /** Send one raw machine-protocol op; return the full response array. */
    public function request(array $op): array
    {
        $line = json_encode($op);
        fwrite($this->stdin, $line . "\n");
        fflush($this->stdin);
        $reply = fgets($this->stdout);
        if ($reply === false) {
            throw new CHEXException('chex closed the stream (stderr may have details)');
        }
        return json_decode($reply, true);
    }

    /** Validate data against a schema (name or .schema.json path); returns the validated data. */
    public function validate(string $schema, array $data, ?string $schemaDir = null)
    {
        return $this->op('validate', ['schema' => $schema, 'data' => $data, 'schemaDir' => $schemaDir]);
    }

    public function close(): void
    {
        if (is_resource($this->stdin)) {
            fclose($this->stdin);
        }
        if (is_resource($this->proc)) {
            proc_close($this->proc);
        }
    }

    private function op(string $name, array $fields)
    {
        $payload = ['op' => $name];
        foreach ($fields as $key => $value) {
            if ($value !== null) {
                $payload[$key] = $value;
            }
        }
        $response = $this->request($payload);
        if (empty($response['ok'])) {
            throw new CHEXException($response['error']['message'] ?? 'chex error');
        }
        return $response['result'];
    }
}
