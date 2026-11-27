#!/bin/sh
# The executable is installed at <injected home>/<bin directory>/claude.
[ -f "$HOME/fake-cli-home" ] || exit 90
# The Apple Python launcher adds environment variables. Record keys before it runs.
/usr/bin/env | /usr/bin/cut -d= -f1 > "$HOME/cli-env"
exec /usr/bin/python3 -I - "$@" <<'PYTHON'
"""A local playback CLI for the Rust connection tests."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time

home = Path(os.environ["HOME"])
# A missing injected home must fail before even opening the argument log.
assert home.joinpath("fake-cli-home").is_file()
args = sys.argv[1:]
profile = os.environ.get("CLAUDE_CONFIG_DIR")
with (home / "calls").open("a") as log:
    print(json.dumps(dict(args=args, profile=profile, cwd=os.getcwd(), env=(home / "cli-env").read_text().splitlines())), file=log)

assert args[0] == "mcp"
verb = args[1]
override = home / (verb + "-reply")
reply = {}
if override.exists():
    reply = json.loads(override.read_text())
    if reply.get("once"):
        override.unlink()

def finish_reply():
    if "nextGet" in reply:
        (home / "get-reply").write_text(json.dumps(reply["nextGet"]))
    if reply.get("snapshot"):
        records = home / "Library/Application Support/studio.aphrodite.mela/connect"
        shutil.copyfile(next(records.glob("claude-*.json")), home / "repoint-snapshot")
        (home / "repoint-snapshot").chmod(0o600)
    if reply.get("hang"):
        time.sleep(30)
    print(reply.get("out", ""))
    print(reply.get("err", ""), file=sys.stderr)
    if reply.get("signal"):
        os.kill(os.getpid(), reply["signal"])
    sys.exit(reply["exit"])

if reply and not reply.get("afterWrite"):
    finish_reply()

def fixture(name, **values):
    template = (home / "fixtures" / (name + ".txt")).read_text().split("\n", 1)[1]
    return template.format(**values)

config = Path(profile or home) / ".claude.json"
state = home / ("entry" if config == home / ".claude.json" else "entry-" + hashlib.sha256(os.fsencode(config)).hexdigest())  # display only
if verb == "get":
    assert args == ["mcp", "get", "aphrodite"]
    if not state.exists():
        sys.exit(fixture("get-missing").rstrip("\n"))
    sys.stdout.buffer.write(state.read_bytes())
elif verb == "add":
    assert args[:-1] == ["mcp", "add", "--transport", "stdio", "--scope", "user", "aphrodite", "--"]
    if state.exists():
        sys.exit(fixture("add-exists").rstrip("\n"))
    state.write_text(fixture("get-stdio", command=args[-1], args=""))
    sys.stdout.write(fixture("add", command=args[-1], config=config))
elif verb == "remove":
    assert args == ["mcp", "remove", "--scope", "user", "aphrodite"]
    if not state.exists():
        sys.exit(fixture("remove-missing").rstrip("\n"))
    state.unlink()
    sys.stdout.write(fixture("remove", config=config))
else:
    sys.exit(2)
if reply:
    finish_reply()
PYTHON
