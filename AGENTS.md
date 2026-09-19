# Agent guide

This project's full guide for building and editing tools lives in [`CLAUDE.md`](CLAUDE.md).
It's the single source of truth — read it before creating or changing a tool, whichever
agent you are (Claude Code, Codex, Cursor, or anything else).

`CLAUDE.md` covers the tool contract, the settings schema, the runtime API, and worked
examples. There is nothing agent-specific in it; the filename is just where Claude Code
looks first.

## The one rule to get right

A tool you build goes in `tools/`, and is listed in the `TOOLS` array in `/index.html`.

`tools/` belongs to the user and starts empty — put only what they asked for in it. The
worked examples live in `examples/` and are read-only reference with their own frame at
`examples/index.html`. Never copy them into `tools/`, and never add a user's tool to the
examples frame.
