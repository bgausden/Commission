# TypeScript Config Guide

This repository uses multiple TypeScript configuration files on purpose. They solve different problems and prevent conflicts between build output, script tooling, and test type-checking.

## Why More Than One `tsconfig`?

A single config caused conflicting goals:

- Build needs a narrow compile scope (`src/` only) and emits to `dist/`.
- Tests and script utilities need broader type-checking across `src/`, `scripts/`, and spec files.
- Some test files import utilities under `scripts/`, which can conflict with a build config that enforces `rootDir: src`.

Splitting configs keeps each workflow strict and predictable.

## Config Files

### `tsconfig.json`

Primary type-check config for editor tooling and broad project checks.

- `noEmit: true` so it is used for checking, not publishing output.
- `rootDir: .` so imports between `src/` and `scripts/` can be type-checked together.
- Includes:
  - `src/**/*.ts`
  - `scripts/**/*.ts`
  - test files (`**/*.spec.ts`, `**/*.test.ts`)
  - `vitest.config.ts`
  - generated config types (`config/**/*.d.ts`)

Use this when you want full-project static checks.

### `tsconfig.build.json`

Build-specific config used by the production build pipeline.

- Extends `tsconfig.json` for base compiler settings.
- Sets `rootDir: src` and `outDir: dist`.
- Includes only runtime source and needed declaration files:
  - `src/**/*.ts`
  - `config/**/*.d.ts`
- Excludes script code and test files.

This prevents build-time issues where test-only imports (for example, from `src/*.spec.ts` into `scripts/`) violate `rootDir: src` expectations.

### `scripts/tsconfig.json`

Script-local config for tools under `scripts/`.

- Extends root `tsconfig.json`.
- `noEmit: true` and `rootDir: ..`.
- Includes `scripts/**/*.ts`.

Useful for script-focused validation and editor behavior scoped to tooling code.

## How Build Uses This

`npm run build` runs [scripts/build.js](scripts/build.js), which calls:

- `tsc -p tsconfig.build.json`

Then it copies runtime artifacts into `dist/`.

This separation is required so build compiles only production code while the main project config can still type-check scripts and tests.

## Which Config Should I Use?

- Full project type-check: `npx tsc -p tsconfig.json --noEmit`
- Build output compile: `npx tsc -p tsconfig.build.json`
- Scripts-only checks: `npx tsc -p scripts/tsconfig.json --noEmit`

## Common Pitfall This Avoids

If build uses the broad config, TypeScript can fail with errors like:

- file not under `rootDir` (`src`) because a spec imports from `scripts/`

Keeping build/test concerns split avoids this class of error while preserving strict checks everywhere else.
