#!/usr/bin/python3 -I
"""A local playback CLI for the Rust connection tests."""
import json
import os
from pathlib import Path
import sys
import time

home = Path(os.environ["HOME"])
# A missing injected home must fail before even opening the argument log.
assert home.joinpath("fake-cli-home").is_file()
args = sys.argv[1:]
with (home / "calls").open("a") as log:
    print(json.dumps(dict(args=args, cwd=os.getcwd(), env=(home / "cli-env").read_text().splitlines())), file=log)

assert args[0] == "mcp"
verb = args[1]
override = home / (verb + "-reply")
if override.exists():
    reply = json.loads(override.read_text())
    if reply.get("once"):
        override.unlink()
    if reply.get("hang"):
        time.sleep(30)
    print(reply.get("out", ""))
    print(reply.get("err", ""), file=sys.stderr)
    sys.exit(reply["exit"])

state = home / "entry"
if verb == "get":
    assert args == ["mcp", "get", "aphrodite"]
    if not state.exists():
        sys.exit('No MCP server named "aphrodite". Configured servers: private-neighbor')
    print(state.read_text())
elif verb == "add":
    assert args[:-1] == ["mcp", "add", "--transport", "stdio", "--scope", "user", "aphrodite", "--"]
    if state.exists():
        sys.exit("MCP server aphrodite already exists in user config")
    state.write_text(f"aphrodite:\n  Scope: User config (available in all your projects)\n  Status: Connected\n  Type: stdio\n  Command: {args[-1]}\n  Args: \n")
    print(f"Added stdio MCP server aphrodite with command: {args[-1]} to user config")
elif verb == "remove":
    assert args == ["mcp", "remove", "--scope", "user", "aphrodite"]
    if not state.exists():
        sys.exit('No MCP server named "aphrodite" in user scope')
    state.unlink()
    print("Removed MCP server aphrodite from user config")
else:
    sys.exit(2)
print("File modified: private-neighbor", file=sys.stderr)
