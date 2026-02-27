# CLAUDE.md

## Project Overview

`siu-boilerplate` is a Node.js CLI tool that scaffolds predefined boilerplate projects. It currently ships one template (`cloudflare-monorepo`) and supports optional addons (drizzle, hono, tailwind, biome). Distributed as a private package installable from a GitHub repo.

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
      addons/                       # Addon overlay files (drizzle/, hono/, tailwind/, biome/)
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
node dist/index.js my-app -t cloudflare-monorepo -a drizzle,hono --no-git --no-install
node dist/index.js my-app -t cloudflare-monorepo --yes --no-install
```

## Architecture Notes

- **Three input modes**: fully interactive (no flags), fully non-interactive (all flags), hybrid (partial flags + prompts for the rest). Handled by `resolveConfig()` in `create.ts`.
- **Template variables**: `{{projectName}}` is replaced in all text files (extensions in `TEXT_FILE_EXTENSIONS`).
- **Addon system**: Each addon in `template.json` declares `filesToCopy` (overlay), `patchFiles` (mergeJson/appendLine/prependLine/replaceText), `packages`/`devPackages`, `dependsOn`, and `conflictsWith`.
- **Patch operations are idempotent** — `appendLine` checks `fileContainsLine()` before appending, so the `add` command won't duplicate lines.
- **Template path resolution**: `getTemplatesDir()` in `utils.ts` resolves relative to `import.meta.url`. Since tsup bundles into `dist/index.js`, it looks for `dist/templates/` first.
- **`.spinitup.json`**: Written to generated projects to track which template and addons were installed. Used by the `add` command.
- **`tsup.config.ts`** uses `rsync -a` (not `cp -r`) in `onSuccess` to correctly copy dotfiles like `.gitignore` and `.npmrc`.

## Adding a New Template

1. Create `src/templates/<template-id>/template.json` with the manifest
2. Add base files under `src/templates/<template-id>/files/`
3. Add addon overlays under `src/templates/<template-id>/addons/<addon-id>/`
4. The CLI auto-discovers templates by scanning the `templates/` directory

## Adding a New Addon

1. Add an entry to `addons` in the template's `template.json`
2. Create the overlay files under `addons/<addon-id>/`
3. Define `patchFiles` for any files that need modification (workspace config, package.json deps, etc.)

## Conventions

- Template file content uses `{{projectName}}` as the only template variable
- Worker apps use `wrangler.jsonc` (not `.toml`), with `nodejs_compat` flag and `satisfies ExportedHandler<Env>`
- TypeScript configs extend from `@<projectName>/typescript-config` (`workers.json` or `nextjs.json`)
- Workspace packages use `workspace:*` for internal dependencies
