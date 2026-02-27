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

## Testing the CLI

```bash
# After building, test from /tmp:
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

Follow these phases in order. Every phase has a gate — do NOT proceed to the next phase until the gate passes. Use `/tmp/siu-test-<template-id>` as the scratch directory throughout.

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
cd /tmp && rm -rf siu-test-<template-id>
node <path-to-repo>/dist/index.js siu-test-<template-id> -t <template-id> --no-git --no-install
```

Then verify:
1. `ls -la /tmp/siu-test-<template-id>/` — all expected top-level files exist (`.gitignore`, `.npmrc`, `package.json`, `turbo.json`, etc.)
2. `cat /tmp/siu-test-<template-id>/package.json` — `"name"` is `"siu-test-<template-id>"`, not `"{{projectName}}"`
3. `grep -r '{{projectName}}' /tmp/siu-test-<template-id>/` — must return **zero results** (all vars replaced)
4. `.spinitup.json` exists and contains the correct template name
5. Every `package.json` in the workspace has `"name": "@siu-test-<template-id>/..."` (not template variable)
6. Every `tsconfig.json` has valid `extends` paths (no `{{projectName}}`)

**Gate: All 6 checks above must pass. Fix template files and re-run from `pnpm build` until they do.**

### Phase 4: Full scaffold with install

Test that dependencies resolve and the project builds:

```bash
cd /tmp && rm -rf siu-test-<template-id>
node <path-to-repo>/dist/index.js siu-test-<template-id> -t <template-id> --no-git
```

Then verify inside the generated project:

```bash
cd /tmp/siu-test-<template-id>

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
timeout 10 pnpm dev &>/dev/null &
DEV_PID=$!; sleep 5; kill $DEV_PID 2>/dev/null
echo "PASS: dev server started"
```

**Gate: Steps 1-4 must pass. Steps 5-6 are best-effort.**

### Phase 5: Test each addon in isolation

For each addon defined in `template.json`, scaffold with only that addon:

```bash
cd /tmp && rm -rf siu-test-<template-id>-addon-<addon-id>
node <path-to-repo>/dist/index.js siu-test-<template-id>-addon-<addon-id> \
  -t <template-id> -a <addon-id> --no-git
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
cd /tmp && rm -rf siu-test-<template-id>-all
node <path-to-repo>/dist/index.js siu-test-<template-id>-all \
  -t <template-id> -a <addon1>,<addon2>,<addon3> --no-git
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
cd /tmp && rm -rf siu-test-<template-id>-add
node <path-to-repo>/dist/index.js siu-test-<template-id>-add \
  -t <template-id> --no-git

# Add an addon after the fact
cd /tmp/siu-test-<template-id>-add
node <path-to-repo>/dist/index.js add
# Select addon interactively, or test non-interactively if supported
```

Then verify:
1. `.spinitup.json` now includes the newly added addon
2. `pnpm typecheck` passes
3. `pnpm build` passes

### Phase 8: CLI metadata checks

```bash
pnpm build
node <path-to-repo>/dist/index.js --list templates
# Must show the new template with correct name/description

node <path-to-repo>/dist/index.js --list addons -t <template-id>
# Must show all addons with correct labels/descriptions
```

**Gate: Both commands must show the new template and its addons.**

### Quick Reference: Validation Checklist

Use this condensed checklist when making any template change:

```
[ ] pnpm build && pnpm typecheck (CLI itself compiles)
[ ] --list templates shows new template
[ ] --list addons -t <id> shows all addons
[ ] Scaffold --no-install: no {{projectName}} in output
[ ] Scaffold with install: pnpm typecheck && pnpm build pass in generated project
[ ] Each addon individually: typecheck + build pass
[ ] All addons combined: typecheck + build pass
[ ] add command works post-creation
```

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
