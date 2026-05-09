# Commission Calculator - Copilot Instructions

Purpose: define Copilot-specific behavior for this repository.
Do not duplicate domain contracts or runbook constraints here.

## Source of Truth Split

- Architecture, domain contracts, and runbook constraints: `AGENTS.md`
- Deep setup/how-to docs: `docs/`
- Claude-agent-only behavior: `CLAUDE.md`

If guidance appears in multiple files, prefer removing duplicates and linking to one canonical source.

## Copilot Workflow Expectations

1. Start with `AGENTS.md` before making non-trivial changes.
2. For domain behavior questions, read `AGENTS.md` and then inspect code.
3. Keep edits minimal and local to user intent.
4. Preserve existing file style and module boundaries.
5. Favor existing loaders/utilities over introducing parallel paths.

## Change Validation (Copilot)

Before considering work complete, run the project gates described in `AGENTS.md`.
If a gate fails, fix or explicitly report blockers.

## Codebase-Specific Notes for Copilot

1. xlsx dependency is vendored via `vendor/xlsx-0.20.3.tgz`.
2. This is an ESM TypeScript project; relative imports use `.js` suffixes.
3. UI/design work in `public/` should follow `.impeccable.md`.

## Documentation Hygiene

- Keep this file focused on Copilot execution behavior.
- Put business rules and architecture contracts in `AGENTS.md`.
- Keep `CLAUDE.md` for Claude-agent-only guidance.
- Put setup walkthroughs in `docs/`.
