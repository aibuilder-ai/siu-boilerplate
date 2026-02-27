---
name: siu-create-template
description: >
  Step-by-step workflow for creating new boilerplate templates and addons in
  the siu-boilerplate CLI. Use this skill when: (1) creating a new template
  from scratch (e.g., "create a turborepo with Next.js and Supabase template"),
  (2) adding a new addon to an existing template, (3) modifying template files
  or patch operations, (4) debugging template scaffolding failures. Triggers on
  tasks involving siu-boilerplate, template creation, boilerplate scaffolding,
  or the `pnpm test:template` command.
---

# Create siu-boilerplate Template

## Repo location

The siu-boilerplate repo is at the project root. All paths below are relative to it.

## Gated workflow

Follow these phases in order. Do NOT skip a gate.

### Phase 1: Research dependencies with Context7

Before writing any files, use Context7 MCP tools to fetch up-to-date docs for every major dependency. This prevents shipping outdated configs and APIs.

1. For each key dependency (framework, build tool, runtime), call `mcp__context7__resolve-library-id` to get the library ID
2. Call `mcp__context7__query-docs` to retrieve current setup guides, config formats, and API patterns
3. Pay special attention to: package.json scripts, tsconfig options, config file formats (has the tool switched from `.js` to `.ts`?), and CLI flags that may have changed

Example for a Next.js + Supabase template — resolve and query:
- `next.js` (app router setup, next.config)
- `supabase` (client setup, env vars)
- `turborepo` (turbo.json task config)
- `tailwindcss` (v4 config changes)
- `typescript` (tsconfig options)
- Any platform-specific SDK (e.g., `@opennextjs/cloudflare`, `wrangler`)

**Gate: have current docs for all major dependencies before writing template files.**

### Phase 2: Plan the template

Define scope before creating files:

1. **Template ID** — lowercase-kebab-case (e.g., `nextjs-supabase-monorepo`)
2. **Package manager** — `pnpm` | `npm` | `bun`
3. **Workspace packages** — list all (e.g., `apps/web`, `packages/ui`, `packages/typescript-config`)
4. **Addons** — with `dependsOn` / `conflictsWith`
5. **postCreateCommands** — commands that run after install (codegen, shadcn init, etc.)
6. **Draft `template.json`** — see [references/template-schema.md](references/template-schema.md) for full schema and real example

### Phase 3: Create template files

Create the directory structure:

```
src/templates/<template-id>/
  template.json
  files/          # base boilerplate
  addons/         # addon overlays (if any)
```

Rules for files under `files/`:

- **Dotfiles**: use `_` prefix (`_gitignore`, `_npmrc`) — scaffolder renames them
- **Template var**: `{{projectName}}` is the ONLY variable — use in package names, tsconfig paths, import aliases
- **Replaced in**: `.json`, `.jsonc`, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.yaml`, `.yml`, `.toml`, `.md`, `.html`, `.css`
- **Workspace deps**: use `"workspace:*"` for internal refs
- **TypeScript configs**: create `packages/typescript-config`, extend from `@{{projectName}}/typescript-config`
- **Wrangler** (if Cloudflare): use `wrangler.jsonc` (not `.toml`), include `nodejs_compat`
- **Do NOT ship generated type files** (e.g., `cloudflare-env.d.ts`) — let tooling generate them at scaffold time via `postCreateCommands`

**Gate: `pnpm build && pnpm typecheck` must pass.**

### Phase 4: Automated test — dry-run

```bash
pnpm test:template <template-id> --addons
```

Validates: scaffold succeeds, no `{{projectName}}` leftover, `.spinitup.json` written, package name resolved, every addon scaffolds cleanly.

**Gate: all checks pass.**

### Phase 5: Automated test — full

```bash
pnpm test:template <template-id> --full --addons
```

Also installs deps, runs typecheck, and runs build inside the generated project for every addon combination.

**Gate: all checks pass.**

### Phase 6: Manual smoke test

```bash
cd /tmp && rm -rf smoke-test
node <repo>/dist/index.js smoke-test -t <template-id> --no-git
cd smoke-test && pnpm dev
```

Verify the dev server starts and the project works as expected.

### Phase 7: Update documentation

**This phase is mandatory.** After completing the template (or after any failure/fix during the process):

1. **Update `CLAUDE.md`** — if any conventions changed, new patterns were discovered, or the workflow needs adjustment based on what was learned
2. **Update this skill** — if the workflow had gaps, a pitfall was encountered that isn't listed, or a new Context7 query pattern proved useful, update `SKILL.md` or `references/template-schema.md`
3. **Update memory** — if a stable pattern was confirmed (e.g., "wrangler v4.69+ rejects non-generated type files"), record it in auto memory

This ensures the next template creation benefits from everything learned in this one.

## Adding an addon

See [references/template-schema.md](references/template-schema.md) for `AddonConfig` schema and patch operations.

1. Add entry to `addons` in `template.json`
2. Static files? Create `addons/<addon-id>/` with overlay files
3. Dynamic install? Use `postCreateCommands` instead of `filesToCopy`
4. Need to modify existing files? Use `patchFiles` (mergeJson, appendLine, prependLine, replaceText)
5. Set `dependsOn` / `conflictsWith` if needed
6. Test: `pnpm test:template <template-id> --addons`

## Test script reference

```bash
pnpm test:template                                     # all templates, dry-run
pnpm test:template <id>                                # one template, dry-run
pnpm test:template <id> --addons                       # + addon combos
pnpm test:template <id> --full                         # + install/typecheck/build
pnpm test:template <id> --full --addons                # everything
pnpm test:template <id> --keep                         # keep /tmp dirs for debugging
```

## Common pitfalls

- **Wrangler type files**: never ship static `cloudflare-env.d.ts` or `worker-configuration.d.ts` without the `// Generated by Wrangler` header — newer wrangler refuses to overwrite them. Let `pnpm types` generate them via `postCreateCommands`.
- **Missing `{{projectName}}`**: every `package.json` name, tsconfig path alias, and internal import must use the template variable.
- **Dotfiles stripped by npm**: always name them `_gitignore` / `_npmrc`.
- **Non-text files**: binary files won't get variable replacement — don't put `{{projectName}}` in them.
- **Addon patch ordering**: `replaceText` does simple string replace (first match only). Make the `find` string unique.
- **Stale dependency versions**: always use Context7 to verify latest stable versions before hardcoding version strings in package.json files.
