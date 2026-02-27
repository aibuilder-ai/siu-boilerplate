# PRD: `siu-boilerplate` — CLI Boilerplate Generator

## Overview

Build a Node.js CLI tool using `@clack/prompts` that scaffolds predefined boilerplate projects (starting with a Cloudflare monorepo) and supports adding optional addon packages both during creation and post-creation via an `add` command. The CLI supports **three input modes**: fully interactive wizard, fully non-interactive via CLI flags (CI-friendly), and hybrid mode where flags supply some values and prompts fill in the rest. The tool should be extensible so new templates and addons can be added by simply dropping folders and updating a manifest — no code changes required. The CLI is distributed as a private package installable directly from a private GitHub repo.

---

## Goals

1. Interactive CLI experience using `@clack/prompts` with spinners, grouped prompts, and colored output.
2. **Dual-mode input**: full interactive wizard, fully non-interactive via CLI flags, or hybrid (flags + prompts for the rest).
3. Template-driven architecture: each boilerplate is a folder of files + a `template.json` manifest.
4. Addon system: optional packages/files that overlay onto a base template.
5. Post-creation `add` command to install addons after initial scaffolding.
6. `--list` command for discoverability of available templates and addons.
7. Distributed as a private package via GitHub repo (no npm registry required).
8. Publishable to npm/GitHub Packages in the future if needed.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| TypeScript | Language |
| `@clack/prompts` | Interactive CLI prompts (select, multiselect, text, confirm, spinner) |
| `picocolors` | Terminal color output |
| `fs-extra` | File system operations (copy, readJson, writeJson, pathExists) |
| `execa` | Shell command execution (git init, pnpm install) |
| `tsup` | Build/bundle the CLI |
| `commander` | Command routing (`create` vs `add`) |

---

## Project Structure

```
siu-boilerplate/
├── src/
│   ├── index.ts                    # Entry point, command routing
│   ├── commands/
│   │   ├── create.ts               # Main scaffold flow (interactive + flag modes)
│   │   ├── add.ts                  # Post-creation addon flow
│   │   └── list.ts                 # --list handler (templates/addons discovery)
│   ├── lib/
│   │   ├── prompts.ts              # All Clack prompt definitions
│   │   ├── scaffolder.ts           # File copy, addon merge, package.json patching
│   │   ├── template-registry.ts    # Reads templates dir, returns metadata
│   │   └── utils.ts                # Helpers (resolve paths, detect package manager, etc.)
│   └── templates/
│       ├── cloudflare-monorepo/
│       │   ├── template.json
│       │   ├── files/              # Base boilerplate files
│       │   │   ├── package.json
│       │   │   ├── turbo.json
│       │   │   ├── pnpm-workspace.yaml
│       │   │   ├── .gitignore
│       │   │   ├── apps/
│       │   │   │   └── web/
│       │   │   │       ├── package.json
│       │   │   │       ├── src/
│       │   │   │       │   └── index.ts
│       │   │   │       ├── wrangler.toml
│       │   │   │       └── tsconfig.json
│       │   │   └── packages/
│       │   │       ├── ui/
│       │   │       │   ├── package.json
│       │   │       │   ├── src/
│       │   │       │   │   └── index.ts
│       │   │       │   └── tsconfig.json
│       │   │       ├── config-typescript/
│       │   │       │   ├── package.json
│       │   │       │   └── base.json
│       │   │       └── config-eslint/
│       │   │           ├── package.json
│       │   │           └── index.js
│       │   └── addons/
│       │       ├── drizzle/
│       │       │   └── packages/
│       │       │       └── db/
│       │       │           ├── package.json
│       │       │           ├── src/
│       │       │           │   ├── schema.ts
│       │       │           │   └── index.ts
│       │       │           └── drizzle.config.ts
│       │       ├── hono/
│       │       │   └── apps/
│       │       │       └── api/
│       │       │           ├── package.json
│       │       │           ├── src/
│       │       │           │   └── index.ts
│       │       │           ├── wrangler.toml
│       │       │           └── tsconfig.json
│       │       ├── tailwind/
│       │       │   └── packages/
│       │       │       └── ui/
│       │       │           ├── tailwind.config.ts
│       │       │           └── postcss.config.js
│       │       └── biome/
│       │           ├── biome.json
│       │           └── packages/
│       │               └── config-biome/
│       │                   ├── package.json
│       │                   └── biome.json
│       └── _example-template/       # Documented example for contributors
│           ├── template.json
│           ├── files/
│           └── addons/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## Detailed Specifications

### 1. `template.json` Schema

Every template directory MUST contain a `template.json` at its root. This is the single source of truth for what a template offers.

```jsonc
{
  "name": "Cloudflare Monorepo",
  "description": "Turborepo + Cloudflare Workers + Pages + D1 + KV",
  "packageManager": "pnpm",          // "pnpm" | "npm" | "bun"
  "postCreateCommands": [             // Optional shell commands run after scaffold
    "pnpm install",
    "pnpm exec turbo telemetry disable"
  ],
  "addons": {
    "drizzle": {
      "label": "Drizzle ORM + D1 adapter",
      "description": "Adds a shared `packages/db` with Drizzle schema and D1 config",
      "packages": {
        "drizzle-orm": "latest"
      },
      "devPackages": {
        "drizzle-kit": "latest"
      },
      "filesToCopy": "addons/drizzle/",
      "patchFiles": {
        "apps/web/package.json": {
          "mergeJson": {
            "dependencies": {
              "@repo/db": "workspace:*"
            }
          }
        },
        "pnpm-workspace.yaml": {
          "appendLine": "  - 'packages/db'"
        }
      },
      "dependsOn": [],                // Addon IDs this addon requires
      "conflictsWith": []             // Addon IDs this addon cannot coexist with
    },
    "hono": {
      "label": "Hono API app",
      "description": "Adds `apps/api` — a Hono app deployed to Cloudflare Workers",
      "packages": {
        "hono": "latest"
      },
      "devPackages": {},
      "filesToCopy": "addons/hono/",
      "patchFiles": {
        "pnpm-workspace.yaml": {
          "appendLine": "  - 'apps/api'"
        }
      },
      "dependsOn": [],
      "conflictsWith": []
    },
    "tailwind": {
      "label": "Tailwind CSS v4",
      "description": "Adds Tailwind CSS config to the UI package",
      "packages": {
        "tailwindcss": "latest",
        "autoprefixer": "latest",
        "postcss": "latest"
      },
      "devPackages": {},
      "filesToCopy": "addons/tailwind/",
      "patchFiles": {},
      "dependsOn": [],
      "conflictsWith": []
    },
    "biome": {
      "label": "Biome (lint + format)",
      "description": "Replaces ESLint + Prettier with Biome",
      "packages": {},
      "devPackages": {
        "@biomejs/biome": "latest"
      },
      "filesToCopy": "addons/biome/",
      "patchFiles": {},
      "dependsOn": [],
      "conflictsWith": ["eslint"]
    }
  }
}
```

### 2. Entry Point — `src/index.ts`

**Requirements:**

- Shebang line: `#!/usr/bin/env node`
- Use `commander` for command routing:
  - Default command (no args or `create`): runs the scaffold flow
  - `add` subcommand: runs the post-creation addon flow
  - `--list` flag: prints available templates or addons
  - `--version` / `-V`: prints version from package.json
  - `--help`: auto-generated help text
- Wrap all logic in try/catch with `p.cancel()` on error

```
Usage:
  # Interactive wizard (no flags)
  npx siu-boilerplate

  # Fully non-interactive (CI-friendly)
  npx siu-boilerplate my-app -t cloudflare-monorepo -a drizzle,hono --git --install

  # Accept all defaults (skip prompts, no addons, git + install)
  npx siu-boilerplate my-app -t cloudflare-monorepo --yes

  # Hybrid — partial flags, prompts for the rest
  npx siu-boilerplate my-app -t cloudflare-monorepo
  # → skips name + template prompts, still asks about addons/git/install

  # Post-creation addon install
  npx siu-boilerplate add

  # Discovery
  npx siu-boilerplate --list templates
  npx siu-boilerplate --list addons -t cloudflare-monorepo

  # Info
  npx siu-boilerplate --version
  npx siu-boilerplate --help
```

**Implementation:**

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { addCommand } from "./commands/add.js";
import { listHandler } from "./commands/list.js";

const program = new Command()
  .name("siu-boilerplate")
  .version("1.0.0")
  .description("Scaffold boilerplate projects")
  .option("--list <type>", "List available templates or addons")
  .option("-t, --template <id>", "Template ID (used with --list addons)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.list) {
      listHandler(opts.list, opts.template);
      process.exit(0);
    }
  });

program.addCommand(createCommand, { isDefault: true });
program.addCommand(addCommand);

program.parse();
```

### 3. Create Command — `src/commands/create.ts`

**CLI Flags (Commander options):**

| Flag | Short | Type | Description |
|---|---|---|---|
| `[project-name]` | — | positional arg | Project directory name |
| `--template <id>` | `-t` | string | Template ID (e.g. `cloudflare-monorepo`) |
| `--addons <list>` | `-a` | string | Comma-separated addon IDs (e.g. `drizzle,hono`) |
| `--git` | — | boolean | Initialize git repo |
| `--no-git` | — | boolean | Skip git init |
| `--install` | — | boolean | Install dependencies after scaffold |
| `--no-install` | — | boolean | Skip dependency installation |
| `--yes` | `-y` | boolean | Accept all defaults, skip all prompts (requires `--template`) |

**Input Resolution Logic — `resolveConfig()`**

The core design pattern: **for each config value, check CLI flag → check `--yes` default → fall back to interactive Clack prompt.** This single function handles all three modes (interactive, non-interactive, hybrid).

```typescript
interface CreateOptions {
  template?: string;
  addons?: string;       // comma-separated string from CLI
  git?: boolean;
  noGit?: boolean;
  install?: boolean;
  noInstall?: boolean;
  yes?: boolean;
}

interface CLIConfig {
  projectName: string;
  template: string;
  addons: string[];
  git: boolean;
  install: boolean;
}

async function resolveConfig(
  nameArg: string | undefined,
  opts: CreateOptions
): Promise<CLIConfig | symbol> {

  // 1. Project name: use positional arg OR prompt
  const projectName = nameArg ?? await p.text({
    message: "Project name",
    placeholder: "my-app",
    validate: (val) => {
      if (!val) return "Required";
      if (!isValidPackageName(val)) return "Invalid package name";
      if (fs.existsSync(val)) return "Directory already exists";
    },
  });
  if (p.isCancel(projectName)) return projectName;

  // 2. Template: use --template flag OR prompt
  const template = opts.template ?? await p.select({
    message: "Pick a boilerplate",
    options: getTemplates(),
  });
  if (p.isCancel(template)) return template;

  // 3. Addons: use --addons flag OR --yes (empty) OR prompt
  let addons: string[];
  if (opts.addons) {
    addons = opts.addons.split(",").map((a) => a.trim());
    // Validate addon IDs exist in template
    const validAddons = getAddonOptions(template as string).map((a) => a.value);
    const invalid = addons.filter((a) => !validAddons.includes(a));
    if (invalid.length > 0) {
      p.log.error(`Unknown addons: ${invalid.join(", ")}. Available: ${validAddons.join(", ")}`);
      process.exit(1);
    }
  } else if (opts.yes) {
    addons = [];
  } else {
    const selected = await p.multiselect({
      message: "Add packages/addons (space to select, enter to confirm)",
      options: getAddonOptions(template as string),
      required: false,
    });
    if (p.isCancel(selected)) return selected;
    addons = selected as string[];
  }

  // 4. Git: use --git/--no-git flag OR --yes (true) OR prompt
  const git = opts.git !== undefined
    ? opts.git
    : opts.yes
      ? true
      : await p.confirm({ message: "Initialize git?", initialValue: true });
  if (p.isCancel(git)) return git;

  // 5. Install: use --install/--no-install flag OR --yes (true) OR prompt
  const install = opts.install !== undefined
    ? opts.install
    : opts.yes
      ? true
      : await p.confirm({ message: "Install dependencies?", initialValue: true });
  if (p.isCancel(install)) return install;

  return {
    projectName: projectName as string,
    template: template as string,
    addons,
    git: git as boolean,
    install: install as boolean,
  };
}
```

**Commander wiring:**

```typescript
import { Command } from "commander";
import * as p from "@clack/prompts";

export const createCommand = new Command("create")
  .argument("[project-name]", "Name of the project")
  .option("-t, --template <id>", "Template to use")
  .option("-a, --addons <addons>", "Comma-separated addon IDs")
  .option("--git", "Initialize git repo")
  .option("--no-git", "Skip git init")
  .option("--install", "Install dependencies")
  .option("--no-install", "Skip dependency installation")
  .option("-y, --yes", "Accept all defaults (skip prompts)")
  .action(async (projectNameArg, opts) => {
    p.intro("siu-boilerplate");

    // Validate: --yes requires --template
    if (opts.yes && !opts.template) {
      p.log.error("--yes requires --template to be specified");
      process.exit(1);
    }

    const config = await resolveConfig(projectNameArg, opts);

    if (p.isCancel(config)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    await scaffold(config as CLIConfig);

    p.outro("Project created!");
    console.log(`\n  cd ${(config as CLIConfig).projectName}`);
    console.log(`  pnpm install`);
    console.log(`  pnpm dev\n`);
  });
```

**Prompt Flow (interactive mode, using `p.group` style sequential prompts):**

| Step | Prompt Type | Skipped when | Details |
|---|---|---|---|
| 1 | `p.text` | positional arg provided | **Project name** — validate: non-empty, valid npm name, directory doesn't exist |
| 2 | `p.select` | `--template` flag | **Template** — dynamically populated from `templates/` directories |
| 3 | `p.multiselect` | `--addons` flag or `--yes` | **Addons** — dynamically populated from selected template's `template.json`. Respect `dependsOn` and `conflictsWith` (show hints). `required: false` so user can skip. |
| 4 | `p.confirm` | `--git` / `--no-git` flag or `--yes` | **Initialize git?** — default `true` |
| 5 | `p.confirm` | `--install` / `--no-install` flag or `--yes` | **Install dependencies?** — default `true` |

**Scaffold Steps (with `p.spinner` for each):**

1. Copy `files/` directory from selected template to `<projectName>/`
2. For each selected addon:
   a. Copy addon's `filesToCopy` directory into destination (merge, overwrite)
   b. Apply `patchFiles` operations (see Patch Operations spec below)
   c. Merge `packages` into root or relevant `package.json` dependencies
   d. Merge `devPackages` into root or relevant `package.json` devDependencies
3. Write `.spinitup.json` to project root (tracks template + installed addons for `add` command)
4. If git confirmed: run `git init` + `git add -A` via `execa`
5. If install confirmed: run the template's `packageManager install` via `execa`
6. Run any `postCreateCommands` from template.json

**`.spinitup.json` schema (written to generated project root):**

```json
{
  "template": "cloudflare-monorepo",
  "installedAddons": ["drizzle", "hono"],
  "createdAt": "2026-02-27T12:00:00Z",
  "cliVersion": "1.0.0"
}
```

**End output:**

```
✔ Project created!

  cd my-app
  pnpm install   (if not auto-installed)
  pnpm dev
```

### 4. Add Command — `src/commands/add.ts`

**Requirements:**

- Detect `.spinitup.json` in current working directory. If missing, show error: "This directory was not created with siu-boilerplate."
- Read template name from `.spinitup.json`, load corresponding `template.json`
- Filter addons: remove already-installed ones (from `.spinitup.json.installedAddons`)
- Show `p.multiselect` with remaining addons
- Run same addon application logic as create command (copy files, patch, merge deps)
- Auto-run package manager install after applying
- Update `.spinitup.json` with newly installed addons
- If no addons available, show `p.log.info("All addons are already installed!")`

### 6. List Command — `src/commands/list.ts`

Provides discoverability of available templates and addons without entering the interactive wizard. Useful for scripting and CI.

**Usage:**

```bash
# List all templates
siu-boilerplate --list templates

# List addons for a specific template
siu-boilerplate --list addons --template cloudflare-monorepo
# or shorthand:
siu-boilerplate --list addons -t cloudflare-monorepo
```

**Implementation:**

```typescript
import { getTemplates, getTemplateMeta } from "../lib/template-registry.js";
import color from "picocolors";

export function listHandler(type: string, templateId?: string) {
  if (type === "templates") {
    const templates = getTemplates();
    console.log(color.bold("\nAvailable templates:\n"));
    templates.forEach((t) => {
      console.log(`  ${color.cyan(t.value)}  — ${t.hint}`);
    });
    console.log();
  } else if (type === "addons") {
    if (!templateId) {
      console.error(color.red("Error: --template is required with --list addons"));
      console.error("  Example: siu-boilerplate --list addons -t cloudflare-monorepo");
      process.exit(1);
    }
    const meta = getTemplateMeta(templateId);
    console.log(color.bold(`\nAddons for ${meta.name}:\n`));
    Object.entries(meta.addons).forEach(([key, addon]: [string, any]) => {
      console.log(`  ${color.cyan(key)}  — ${addon.label}`);
      if (addon.description) {
        console.log(`    ${color.dim(addon.description)}`);
      }
    });
    console.log();
  } else {
    console.error(color.red(`Unknown list type: "${type}". Use "templates" or "addons".`));
    process.exit(1);
  }
}
```

**Expected output example:**

```
Available templates:

  cloudflare-monorepo  — Turborepo + Cloudflare Workers + Pages + D1 + KV

Addons for Cloudflare Monorepo:

  drizzle  — Drizzle ORM + D1 adapter
    Adds a shared `packages/db` with Drizzle schema and D1 config
  hono     — Hono API app
    Adds `apps/api` — a Hono app deployed to Cloudflare Workers
  tailwind — Tailwind CSS v4
    Adds Tailwind CSS config to the UI package
  biome    — Biome (lint + format)
    Replaces ESLint + Prettier with Biome
```

### 7. Patch Operations — `src/lib/scaffolder.ts`

The `patchFiles` field in addon config supports these operations:

| Operation | Description | Implementation |
|---|---|---|
| `mergeJson` | Deep merge a JSON object into an existing JSON file | Read file as JSON, deep merge (lodash-style or custom), write back |
| `appendLine` | Append a line to a text file | Read file, append string + newline, write back |
| `prependLine` | Prepend a line to a text file | Read file, prepend string + newline, write back |
| `replaceText` | Find and replace a string in a file | Read file as text, `string.replace(find, replace)`, write back. Object with `{ find: string, replace: string }` |

All patch operations MUST:
- Check if target file exists before patching. If not, log a warning and skip.
- Be idempotent (don't duplicate lines if run twice — relevant for `add` command).

### 8. Template Registry — `src/lib/template-registry.ts`

**Exports:**

```typescript
// Returns list of available templates with metadata
getTemplates(): { value: string; label: string; hint: string }[]

// Returns template.json content for a given template
getTemplateMeta(templateId: string): TemplateConfig

// Returns addon options for a given template, respecting conflicts/deps
getAddonOptions(templateId: string, installedAddons?: string[]): AddonOption[]
```

- Reads from the `templates/` directory relative to the built CLI package
- Caches reads within a single CLI run (no need for persistent cache)

### 9. Utils — `src/lib/utils.ts`

**Exports:**

```typescript
// Resolve the templates directory (handles both dev and built/published paths)
getTemplatesDir(): string

// Detect which package manager the user invoked with (npm, pnpm, yarn, bun)
detectPackageManager(): "pnpm" | "npm" | "yarn" | "bun"

// Validate npm package name
isValidPackageName(name: string): boolean

// Deep merge two objects (for JSON patching)
deepMerge<T>(target: T, source: Partial<T>): T

// Check if a line already exists in a file (for idempotent appends)
fileContainsLine(filePath: string, line: string): Promise<boolean>
```

---

## Cloudflare Monorepo Template — File Contents

### `files/package.json`

```json
{
  "name": "{{projectName}}",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

> **Template variables:** The scaffolder MUST replace `{{projectName}}` in any file content with the actual project name entered by the user. Scan all `.json`, `.ts`, `.js`, `.yaml`, `.yml`, `.toml`, `.md` files for `{{projectName}}` and replace.

### `files/turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

### `files/pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `files/.gitignore`

```
node_modules
dist
.turbo
.wrangler
.dev.vars
*.log
```

### `files/apps/web/package.json`

```json
{
  "name": "@{{projectName}}/web",
  "private": true,
  "scripts": {
    "dev": "wrangler pages dev src/ --live-reload",
    "build": "tsc",
    "deploy": "wrangler pages deploy dist/"
  },
  "dependencies": {
    "@{{projectName}}/ui": "workspace:*"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "latest",
    "wrangler": "latest",
    "typescript": "^5.7.0"
  }
}
```

### `files/apps/web/src/index.ts`

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("Hello from {{projectName}}!", {
      headers: { "content-type": "text/plain" },
    });
  },
};
```

### `files/apps/web/wrangler.toml`

```toml
name = "{{projectName}}-web"
main = "src/index.ts"
compatibility_date = "2025-01-01"
```

### `files/apps/web/tsconfig.json`

```json
{
  "extends": "@{{projectName}}/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

### `files/packages/ui/package.json`

```json
{
  "name": "@{{projectName}}/ui",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

### `files/packages/ui/src/index.ts`

```typescript
export function createButton(label: string): string {
  return `<button>${label}</button>`;
}
```

### `files/packages/config-typescript/package.json`

```json
{
  "name": "@{{projectName}}/config-typescript",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json"]
}
```

### `files/packages/config-typescript/base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### `files/packages/config-eslint/package.json`

```json
{
  "name": "@{{projectName}}/config-eslint",
  "version": "0.0.0",
  "private": true,
  "main": "index.js"
}
```

### `files/packages/config-eslint/index.js`

```javascript
module.exports = {
  extends: ["eslint:recommended"],
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
};
```

---

## Addon File Contents

### Drizzle Addon — `addons/drizzle/packages/db/package.json`

```json
{
  "name": "@{{projectName}}/db",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "drizzle-orm": "latest"
  },
  "devDependencies": {
    "drizzle-kit": "latest"
  }
}
```

### Drizzle Addon — `addons/drizzle/packages/db/src/schema.ts`

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

### Drizzle Addon — `addons/drizzle/packages/db/src/index.ts`

```typescript
export * from "./schema";
```

### Drizzle Addon — `addons/drizzle/packages/db/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
```

### Hono Addon — `addons/hono/apps/api/package.json`

```json
{
  "name": "@{{projectName}}/api",
  "private": true,
  "scripts": {
    "dev": "wrangler dev src/index.ts",
    "build": "tsc",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "hono": "latest"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "latest",
    "wrangler": "latest",
    "typescript": "^5.7.0"
  }
}
```

### Hono Addon — `addons/hono/apps/api/src/index.ts`

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  // Add your bindings here (D1, KV, etc.)
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/", (c) => c.json({ message: "Hello from {{projectName}} API!" }));

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
```

### Hono Addon — `addons/hono/apps/api/wrangler.toml`

```toml
name = "{{projectName}}-api"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Uncomment to bind D1:
# [[d1_databases]]
# binding = "DB"
# database_name = "{{projectName}}-db"
# database_id = "<your-database-id>"
```

### Hono Addon — `addons/hono/apps/api/tsconfig.json`

```json
{
  "extends": "@{{projectName}}/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

### Tailwind Addon — `addons/tailwind/packages/ui/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../apps/*/src/**/*.{ts,tsx,html}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

### Tailwind Addon — `addons/tailwind/packages/ui/postcss.config.js`

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### Biome Addon — `addons/biome/biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

---

## Build & Publish Configuration

### `tsup.config.ts`

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "node18",
  // CRITICAL: bundle templates directory as assets or copy alongside
  // Use the onSuccess hook to copy templates to dist/
  onSuccess: "cp -r src/templates dist/templates",
});
```

### `package.json` (root)

```json
{
  "name": "siu-boilerplate",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "siu-boilerplate": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "local": "pnpm build && node dist/index.js"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.0",
    "commander": "^13.0.0",
    "execa": "^9.0.0",
    "fs-extra": "^11.0.0",
    "picocolors": "^1.1.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["src/templates"]
}
```

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|---|---|
| User presses Ctrl+C at any prompt | `p.isCancel()` detected → `p.cancel("Operation cancelled.")` → `process.exit(0)` |
| Directory already exists | Validation error on project name prompt: "Directory already exists" |
| `--yes` without `--template` | `p.log.error("--yes requires --template")` → exit with code 1 |
| `--addons` with invalid addon ID | Validate against template's addon list → `p.log.error("Unknown addons: xyz. Available: drizzle, hono, ...")` → exit |
| `--addons` with conflicting addons | Check `conflictsWith` → `p.log.error("Conflicting addons: biome and eslint")` → exit |
| `--template` with invalid template ID | `p.log.error("Unknown template: xyz. Run --list templates to see available.")` → exit |
| `--list` with invalid type | `p.log.error('Unknown list type. Use "templates" or "addons".')` → exit |
| `--list addons` without `--template` | `p.log.error("--template is required with --list addons")` → exit |
| Addon has `dependsOn` not selected | **Interactive**: show warning hint "Requires: drizzle". Auto-select dependency if possible. **Flag mode**: auto-include dependencies and log info. |
| Addon has `conflictsWith` selected | **Interactive**: disable conflicting addon or show warning. **Flag mode**: error and exit. |
| Template file missing during patch | Log warning via `p.log.warn()`, skip patch, continue |
| No templates found in templates dir | `p.log.error("No templates found")` → exit |
| `git` not installed | Catch execa error → `p.log.warn("git not found, skipping init")` |
| `pnpm` not installed | Catch execa error → suggest installing and running manually |
| Running `add` outside a project | Check for `.spinitup.json` → show error message |
| All addons already installed | `p.log.info("All addons are already installed!")` → exit cleanly |
| `{{projectName}}` in binary files | Only replace in text file extensions: `.json`, `.ts`, `.tsx`, `.js`, `.jsx`, `.yaml`, `.yml`, `.toml`, `.md`, `.html`, `.css` |

---

## Testing Checklist

After building, verify these scenarios work:

### Interactive Mode
1. **Happy path**: `node dist/index.js` → select cloudflare-monorepo → select drizzle + hono → git yes → install yes → verify all files exist and `{{projectName}}` is replaced everywhere
2. **No addons**: Scaffold with zero addons selected → only base files present
3. **Add command**: After scaffolding, `cd my-app && node ../dist/index.js add` → select remaining addons → verify files merged and `.spinitup.json` updated
4. **Cancel flow**: Ctrl+C at each prompt step → clean exit, no partial files
5. **Duplicate project name**: Enter name of existing directory → validation error shown
6. **Idempotent patches**: Run `add` command selecting an already-installed addon → no duplicate lines in patched files

### Flag Mode (Non-Interactive)
7. **Full flags**: `node dist/index.js my-app -t cloudflare-monorepo -a drizzle,hono --git --install` → no prompts shown, project created correctly
8. **--yes mode**: `node dist/index.js my-app -t cloudflare-monorepo --yes` → no prompts, no addons, git + install both happen
9. **Invalid addon**: `node dist/index.js my-app -t cloudflare-monorepo -a nonexistent` → error with list of valid addons
10. **Invalid template**: `node dist/index.js my-app -t nonexistent` → error with hint to use `--list templates`
11. **Missing --template with --yes**: `node dist/index.js my-app --yes` → error: "--yes requires --template"
12. **Conflicting addons via flags**: `node dist/index.js my-app -t cloudflare-monorepo -a biome,eslint` → error about conflict

### Hybrid Mode
13. **Partial flags**: `node dist/index.js my-app -t cloudflare-monorepo` → skips name + template prompts, still prompts for addons/git/install
14. **Name only**: `node dist/index.js my-app` → prompts for template, addons, git, install

### List Command
15. **List templates**: `node dist/index.js --list templates` → prints template table, exits
16. **List addons**: `node dist/index.js --list addons -t cloudflare-monorepo` → prints addon table with descriptions, exits
17. **List addons no template**: `node dist/index.js --list addons` → error: "--template is required"

---

## Distribution & Hosting (Private Team Access)

The CLI is distributed as a **private GitHub repo** — no npm registry required.

### Setup

1. **Add `prepare` script** to auto-build on install from git:

```json
{
  "scripts": {
    "prepare": "tsup",
    "build": "tsup",
    "dev": "tsup --watch"
  }
}
```

2. **Ensure the repo is private** on GitHub with team members granted read access.

### Team Member Setup (One-Time)

Team members need GitHub auth configured so npm/npx can access the private repo. Two options:

**Option A — SSH (recommended, zero extra setup if already using git over SSH):**

```bash
# If team already uses SSH for git, just add this once:
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

**Option B — GitHub CLI:**

```bash
gh auth login
# Once authenticated, npx/npm can access private repos automatically
```

**Option C — Personal Access Token:**

```bash
# 1. Generate PAT at github.com → Settings → Developer Settings → PAT (classic)
#    Scopes: read:packages + repo
# 2. Configure git:
git config --global url."https://<TOKEN>@github.com/".insteadOf "https://github.com/"
```

### Usage After Auth

```bash
# Run without installing (fetches + builds + runs)
npx github:your-org/siu-boilerplate

# With flags (non-interactive)
npx github:your-org/siu-boilerplate my-app -t cloudflare-monorepo -a drizzle,hono --git --install

# Install globally for repeated use
npm install -g github:your-org/siu-boilerplate
siu-boilerplate

# Pin to a specific version/tag
npx github:your-org/siu-boilerplate#v1.0.0
```

### README Template for the Repo

Include this in the repo's README.md so team members can get started:

```markdown
# siu-boilerplate

Internal CLI to scaffold boilerplate projects.

## Prerequisites

Make sure you can access our private repos:

\```bash
ssh -T git@github.com   # should say "Hi <username>!"

# If not using SSH, run:
git config --global url."git@github.com:".insteadOf "https://github.com/"
\```

## Quick Start

\```bash
# Interactive wizard
npx github:your-org/siu-boilerplate

# Non-interactive (CI-friendly)
npx github:your-org/siu-boilerplate my-app -t cloudflare-monorepo -a drizzle,hono --git --install

# See available options
npx github:your-org/siu-boilerplate --list templates
npx github:your-org/siu-boilerplate --list addons -t cloudflare-monorepo
\```

## Global Install (optional)

\```bash
npm install -g github:your-org/siu-boilerplate
siu-boilerplate
\```
```

### Future: Migrating to a Registry

If the team grows and you want versioned releases with changelogs, migrate to **GitHub Packages**:

```json
// package.json
{
  "name": "@spinitup/siu-boilerplate",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Team members add `.npmrc`:

```
@spinitup:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then usage becomes: `npx @spinitup/siu-boilerplate`

---

## Future Extensibility (Not in Scope for v1, but design for it)

- **Remote templates**: Fetch templates from a git repo or npm package instead of local `templates/` dir
- **Custom user templates**: `siu-boilerplate init-template` command to create a new template scaffold
- **Plugin hooks**: `preCreate`, `postCreate`, `preAddon`, `postAddon` hooks in `template.json`
- **Interactive file previews**: Show a tree of files that will be created before confirming
- **Diff preview for `add`**: Show what files will change before applying an addon

---

## Summary of Agent Instructions

1. Initialize the project with the package.json, tsconfig.json, and tsup.config.ts as specified
2. Install all dependencies
3. Create all source files under `src/` following the structure above, including `commands/list.ts`
4. Implement the `resolveConfig()` function in `create.ts` that handles all three input modes: fully interactive (no flags), fully non-interactive (all flags), and hybrid (partial flags + prompts for the rest)
5. Implement the `--list` command in `list.ts` for template and addon discovery
6. Wire up Commander in `index.ts` with the `--list` preAction hook and default create command
7. Create the full `cloudflare-monorepo` template with all base files and all 4 addon directories
8. Ensure `{{projectName}}` replacement works in all text files
9. Ensure the `add` command reads `.spinitup.json` and only shows uninstalled addons
10. Ensure all patch operations are idempotent
11. Validate CLI flag inputs: unknown addon IDs, unknown template IDs, conflicting addons, `--yes` without `--template`
12. Add `"prepare": "tsup"` script so the CLI auto-builds when installed from a git URL
13. Test all three modes by running `pnpm build && node dist/index.js` with various flag combinations
14. Verify the generated project has correct structure and valid package.json files
15. Run through the full Testing Checklist (interactive, flag, hybrid, and list tests)