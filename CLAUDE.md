# CLAUDE.md

This file is only for Claude-agent-specific guidance in this repository.
Project architecture and domain contracts live in `AGENTS.md`.

## Claude-Agent Workflow

1. Read `AGENTS.md` first for architecture, domain contracts, and execution invariants.
2. Read `.github/copilot-instructions.md` for repo-level agent behavior split.
3. Keep edits minimal and high signal; avoid duplicating rules across instruction files.

## Claude-Specific Trigger

When the user input is `/graphify`, invoke the `graphify` skill before any other action.

## What Belongs Here

- Claude-only workflow notes
- Claude-specific trigger/skill behavior
- No repository business rules or architecture details
