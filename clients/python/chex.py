"""CHEX client — drives the `chex` binary's persistent NDJSON loop.

No pip dependencies. Requires the `chex` binary on PATH or an explicit path.
One long-lived subprocess.

    from chex import CHEX

    with CHEX() as c:
        # schema is a name (with schema_dir) or a path to a .schema.json file
        data = c.validate("./schemas/person.schema.json", {"name": "Ada"})
        # or, resolving "person" against a directory:
        data = c.validate("person", {"name": "Ada"}, schema_dir="./schemas")

`validate` returns the validated data on success and raises CHEXError when the
data does not match the schema. `request(op)` is a raw escape hatch returning
the full response dict.
"""

import json
import subprocess
import threading


class CHEXError(RuntimeError):
    pass


class CHEX:
    def __init__(self, binary="chex"):
        self._proc = subprocess.Popen(
            [binary, "exec", "--loop"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._lock = threading.Lock()

    def request(self, op):
        """Send one raw machine-protocol op; return the full response dict."""
        line = json.dumps(op)
        with self._lock:  # ponytail: one call in flight; drop the lock only if you pipeline
            if self._proc.poll() is not None:
                raise CHEXError("chex process has exited")
            self._proc.stdin.write(line + "\n")
            self._proc.stdin.flush()
            reply = self._proc.stdout.readline()
        if not reply:
            raise CHEXError("chex closed the stream (stderr may have details)")
        return json.loads(reply)

    def _op(self, op, **fields):
        payload = {"op": op}
        for key, value in fields.items():
            if value is not None:
                payload[key] = value
        response = self.request(payload)
        if not response.get("ok"):
            raise CHEXError((response.get("error") or {}).get("message", "chex error"))
        return response.get("result")

    def validate(self, schema, data, schema_dir=None):
        """Validate data against a schema (name or .schema.json path).

        Returns the validated data; raises CHEXError if it does not match.
        """
        return self._op("validate", schema=schema, data=data, schemaDir=schema_dir)

    def close(self):
        if self._proc.poll() is None:
            self._proc.stdin.close()
            self._proc.wait()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
