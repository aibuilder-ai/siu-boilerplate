# CLAUDE.md

## Project Overview

`siu-boilerplate` is a Node.js CLI tool that scaffolds predefined boilerplate projects. It currently ships one template (`cloudflare-monorepo`) with three optional addons (`nextjs-dashboard`, `agentic-skills`, `durable-object-websocket`). Distributed as a private package installable from a GitHub repo.

## Tech Stack

- **Language**: TypeScript (ESM, `"type": "module"`)
- **Build**: tsup — bundles `src/index.ts` into `dist/index.js`, then `rsync` copies `src/templates/` to `dist/templates/`
- **CLI framework**: Commander (command routing) + @clack/prompts (interactive prompts, spinners)
- **File ops**: fs-extra
- **Shell execution**: execa
- **Colors**: picocolors

## Project Structure

```
src/
  index.ts                          # Entry point, shebang, Commander setup
  commands/
    create.ts                       # Main scaffold flow (interactive + flag + hybrid modes)
    add.ts                          # Post-creation addon installer
    list.ts                         # --list templates / --list addons handler
  lib/
    utils.ts                        # getTemplatesDir(), detectPackageManager(), deepMerge(), replaceTemplateVars()
    template-registry.ts            # getTemplates(), getTemplateMeta(), getAddonOptions()
    scaffolder.ts                   # scaffold(), applyAddons(), patch operations
  templates/
    cloudflare-monorepo/
      template.json                 # Template manifest (name, addons, patch rules)
      files/                        # Base boilerplate files copied to destination
      addons/                       # Addon overlay files (nextjs-dashboard/, agentic-skills/)
```

## Key Commands

```bash
pnpm build          # Build CLI (tsup + copy templates)
pnpm dev            # Watch mode
pnpm typecheck      # Type-check without emitting
pnpm local          # Build + run CLI locally
```

## Testing Templates

The `test:template` script scaffolds into a `.sandbox/` directory in the repo and validates the output automatically.

```bash
# Quick dry-run (no install, ~5s) — checks scaffolding + template var replacement
pnpm test:template                                    # all templates
pnpm test:template cloudflare-monorepo                # specific template
pnpm test:template cloudflare-monorepo --addons       # also test each addon

# Full test (with install + typecheck + build, ~2-5min)
pnpm test:template cloudflare-monorepo --full         # base only
pnpm test:template cloudflare-monorepo --full --addons # base + all addon combos

# Debugging — keep temp dirs for inspection
pnpm test:template cloudflare-monorepo --keep
```

After any template change, run at minimum: `pnpm test:template <template-id> --addons`

## Testing the CLI Manually

```bash
# After building, test manually:
node dist/index.js --list templates
node dist/index.js --list addons -t cloudflare-monorepo
node dist/index.js my-app -t cloudflare-monorepo -a nextjs-dashboard,agentic-skills --no-git --no-install
node dist/index.js my-app -t cloudflare-monorepo --yes --no-install
```

## Architecture Notes

- **Three input modes**: fully interactive (no flags), fully non-interactive (all flags), hybrid (partial flags + prompts for the rest). Handled by `resolveConfig()` in `create.ts`.
- **Template variables**: `{{projectName}}` is replaced in all text files (extensions in `TEXT_FILE_EXTENSIONS`).
- **Addon system**: Each addon in `template.json` declares `filesToCopy` (overlay), `patchFiles` (mergeJson/appendLine/prependLine/replaceText), `packages`/`devPackages`, `postCreateCommands` (run after install), `dependsOn`, and `conflictsWith`.
- **Patch operations are idempotent** — `appendLine` checks `fileContainsLine()` before appending, so the `add` command won't duplicate lines.
- **Template path resolution**: `getTemplatesDir()` in `utils.ts` resolves relative to `import.meta.url`. Since tsup bundles into `dist/index.js`, it looks for `dist/templates/` first.
- **`.spinitup.json`**: Written to generated projects to track which template and addons were installed. Used by the `add` command.
- **`tsup.config.ts`** uses `rsync -a` (not `cp -r`) in `onSuccess` to correctly copy dotfiles like `.gitignore` and `.npmrc`.

## Workflow: Creating a New Template

Follow these phases in order. Every phase has a gate — do NOT proceed to the next phase until the gate passes. Use `.sandbox/siu-test-<template-id>` as the scratch directory throughout.

### Phase 1: Plan the template structure

Before writing any files, define the template's scope:

1. **Decide the template ID** — lowercase-kebab-case (e.g., `nextjs-supabase-monorepo`)
2. **Decide the package manager** — `pnpm`, `npm`, or `bun`
3. **List all workspace packages** — e.g., `apps/web`, `apps/api`, `packages/ui`, `packages/typescript-config`
4. **List planned addons** (if any) — with their `dependsOn`/`conflictsWith` relationships
5. **List postCreateCommands** — any commands that need to run after `install` (e.g., codegen, shadcn init)
6. **Draft `template.json`** — write the full manifest before creating any files

### Phase 2: Create base template files

1. Create the directory structure:
   ```
   src/templates/<template-id>/
     template.json           # Already drafted in Phase 1
     files/                  # Base boilerplate
     addons/                 # Addon overlays (if any)
   ```
2. Add all base files under `files/`. Follow these rules:
   - **Dotfiles**: Name them with `_` prefix (`_gitignore`, `_npmrc`) — the scaffolder renames them at copy time
   - **Template vars**: Use `{{projectName}}` anywhere the project name should appear (package.json `name`, tsconfig `paths`, import aliases, etc.)
   - **Only use `{{projectName}}`** — no other template variables are supported
   - **TEXT_FILE_EXTENSIONS** that get variable replacement: `.json`, `.jsonc`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.yaml`, `.yml`, `.toml`, `.md`, `.html`, `.css`
   - **Workspace deps**: Use `"workspace:*"` for internal package references
   - **TypeScript configs**: Create a `packages/typescript-config` package with base configs, then extend from `@{{projectName}}/typescript-config`

**Gate: `pnpm build && pnpm typecheck` must pass.**

### Phase 3: Scaffold dry-run (no install)

Test that the CLI produces the correct file tree without installing dependencies:

```bash
pnpm build
rm -rf .sandbox/siu-test-<template-id>
mkdir -p .sandbox && cd .sandbox
node ../dist/index.js siu-test-<template-id> -t <template-id> --no-git --no-install
cd ..
```

Then verify:
1. `ls -la .sandbox/siu-test-<template-id>/` — all expected top-level files exist (`.gitignore`, `.npmrc`, `package.json`, `turbo.json`, etc.)
2. `cat .sandbox/siu-test-<template-id>/package.json` — `"name"` is `"siu-test-<template-id>"`, not `"{{projectName}}"`
3. `grep -r '{{projectName}}' .sandbox/siu-test-<template-id>/` — must return **zero results** (all vars replaced)
4. `.spinitup.json` exists and contains the correct template name
5. Every `package.json` in the workspace has `"name": "@siu-test-<template-id>/..."` (not template variable)
6. Every `tsconfig.json` has valid `extends` paths (no `{{projectName}}`)

**Gate: All 6 checks above must pass. Fix template files and re-run from `pnpm build` until they do.**

### Phase 4: Full scaffold with install

Test that dependencies resolve and the project builds:

```bash
rm -rf .sandbox/siu-test-<template-id>
mkdir -p .sandbox && cd .sandbox
node ../dist/index.js siu-test-<template-id> -t <template-id> --no-git
cd ..
```

Then verify inside the generated project:

```bash
cd .sandbox/siu-test-<template-id>

# 1. Dependencies installed
ls node_modules/ > /dev/null && echo "PASS: node_modules exists"

# 2. TypeScript compiles
pnpm typecheck || pnpm exec tsc --noEmit
# Must exit 0

# 3. Build succeeds
pnpm build
# Must exit 0

# 4. Turbo tasks work (if turborepo)
pnpm exec turbo build --dry-run
# Must show correct task graph with no errors

# 5. Lint passes (if eslint configured)
pnpm lint 2>/dev/null && echo "PASS: lint" || echo "SKIP: no lint script"

# 6. Dev server starts (spot check — start and kill after 5s)
timeout 3 pnpm dev &>/dev/null &
DEV_PID=$!; sleep 5; kill $DEV_PID 2>/dev/null
echo "PASS: dev server started"
```

**Gate: Steps 1-4 must pass. Steps 5-6 are best-effort.**

### Phase 5: Test each addon in isolation

For each addon defined in `template.json`, scaffold with only that addon:

```bash
rm -rf .sandbox/siu-test-<template-id>-addon-<addon-id>
mkdir -p .sandbox && cd .sandbox
node ../dist/index.js siu-test-<template-id>-addon-<addon-id> \
  -t <template-id> -a <addon-id> --no-git
cd ..
```

Then verify:
1. **Files copied**: Addon-specific files exist in the expected locations
2. **Patches applied**: Files modified by `patchFiles` contain the expected content (check with `grep`)
3. **No duplicate lines**: If the addon uses `appendLine`/`prependLine`, run the scaffold twice into the same dir and verify no duplication
4. **TypeScript compiles**: `pnpm typecheck` passes with the addon applied
5. **Build succeeds**: `pnpm build` passes
6. **postCreateCommands ran**: If the addon has `postCreateCommands`, verify their side effects (e.g., files created by `npx skills add`)

### Phase 6: Test all addons combined

Scaffold with ALL addons enabled at once:

```bash
rm -rf .sandbox/siu-test-<template-id>-all
mkdir -p .sandbox && cd .sandbox
node ../dist/index.js siu-test-<template-id>-all \
  -t <template-id> -a <addon1>,<addon2>,<addon3> --no-git
cd ..
```

Then verify:
1. `pnpm typecheck` — passes
2. `pnpm build` — passes
3. No conflicting files overwritten unexpectedly
4. `.spinitup.json` lists all addons in `installedAddons`

### Phase 7: Test the `add` command

Verify addons can be added post-creation:

```bash
# Scaffold base only
rm -rf .sandbox/siu-test-<template-id>-add
mkdir -p .sandbox && cd .sandbox
node ../dist/index.js siu-test-<template-id>-add \
  -t <template-id> --no-git

# Add an addon after the fact
cd siu-test-<template-id>-add
node ../../dist/index.js add
# Select addon interactively, or test non-interactively if supported
cd ../..
```

Then verify:
1. `.spinitup.json` now includes the newly added addon
2. `pnpm typecheck` passes
3. `pnpm build` passes

### Phase 8: CLI metadata checks

```bash
pnpm build
node dist/index.js --list templates
# Must show the new template with correct name/description

node dist/index.js --list addons -t <template-id>
# Must show all addons with correct labels/descriptions
```

**Gate: Both commands must show the new template and its addons.**

### Quick Reference: Automated Validation

Phases 3-6 and 8 are automated by `pnpm test:template`. Run these after any template change:

```bash
# Minimum (dry-run, ~5s): covers Phases 3, 5-6 dry-run, and 8
pnpm test:template <template-id> --addons

# Full (install + build, ~2-5min): covers Phases 3, 4, 5-6, and 8
pnpm test:template <template-id> --full --addons
```

Phase 7 (`add` command) requires manual testing since it's interactive.

## Adding a New Addon

1. Add an entry to `addons` in the template's `template.json`
2. If the addon has static files: create overlay files under `addons/<addon-id>/`
3. If the addon uses dynamic installation: add `postCreateCommands` instead of `filesToCopy`
4. Define `patchFiles` for any files that need modification (workspace config, package.json deps, etc.)
5. Set `dependsOn` and `conflictsWith` if the addon has relationships with other addons
6. **Test the addon** by running Phases 5-7 of the template creation workflow above

## Conventions

- Template file content uses `{{projectName}}` as the only template variable
- Worker apps use `wrangler.jsonc` (not `.toml`), with `nodejs_compat` flag and `satisfies ExportedHandler<Env>`
- TypeScript configs extend from `@<projectName>/typescript-config` (`workers.json` or `nextjs.json`)
- Workspace packages use `workspace:*` for internal dependencies

## Known Issues & Gotchas

- **`--full` test is CPU-intensive and slow**: The `pnpm test:template <id> --full --addons` command runs `pnpm build` inside each scaffolded project. For OpenNext templates, this triggers a full Next.js production build + Cloudflare bundling per combination (base + each addon + all addons). This is very CPU-heavy and can take 5-10+ minutes. The test script pipes build output to `/dev/null`, so there's no visible progress. Prefer running `--full` tests in a separate terminal, not through Claude Code.
- **Dry-run is the fast feedback loop**: `pnpm test:template <id> --addons` (no `--full`) completes in ~5s and catches most issues (scaffolding, template var replacement, addon patching). Always run this first.
- **Supabase cookie helpers need explicit types**: When using `@supabase/ssr` with `strict: true` in tsconfig, the `setAll(cookiesToSet)` callback needs an explicit type annotation: `cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]`. Without this, TypeScript errors on implicit `any`.
- **Supabase auth API changes**: As of 2025+, Supabase uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `ANON_KEY`) and `supabase.auth.getClaims()` (not `getUser()`) in middleware. Always check the latest Supabase docs before creating auth templates.
- **CLI requires TTY**: The CLI uses `@clack/prompts` which needs a TTY. Running `node dist/index.js` directly from Claude Code's Bash tool fails with `ERR_TTY_INIT_FAILED`. The test script works because it passes `--yes` to skip interactive prompts. For manual testing, always use `--yes` or run in a real terminal.
