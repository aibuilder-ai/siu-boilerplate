# template.json Schema

## TemplateConfig

```typescript
interface TemplateConfig {
  name: string;                      // Display name (e.g., "Cloudflare Monorepo")
  description: string;               // Short description shown in --list
  packageManager: "pnpm" | "npm" | "bun";
  postCreateCommands?: string[];     // Run after `install` (need node_modules)
  addons: Record<string, AddonConfig>;
}
```

## AddonConfig

```typescript
interface AddonConfig {
  label: string;                     // Display name in multiselect
  description: string;               // Hint text
  packages: Record<string, string>;  // Merged into root package.json dependencies
  devPackages: Record<string, string>; // Merged into root package.json devDependencies
  filesToCopy: string;               // Relative path to overlay dir (e.g., "addons/my-addon/"), or "" for none
  patchFiles: Record<string, PatchOperations>; // Keyed by relative file path in generated project
  postCreateCommands?: string[];     // Run after install (same gate as template-level)
  dependsOn: string[];               // Auto-included addon IDs
  conflictsWith: string[];           // Cannot be selected together
}
```

## PatchOperations

Applied to existing files in the generated project. All operations are optional and applied in this order: mergeJson, appendLine, prependLine, replaceText.

```typescript
interface PatchOperations {
  mergeJson?: Record<string, unknown>;  // Deep-merge into JSON file (arrays replace, not concat)
  appendLine?: string;                   // Append line if not already present (idempotent)
  prependLine?: string;                  // Prepend line if not already present (idempotent)
  replaceText?: { find: string; replace: string }; // Simple string replace (first match)
}
```

## Scaffold execution order

1. Copy `files/` to destination
2. Rename dotfiles (`_gitignore` -> `.gitignore`, `_npmrc` -> `.npmrc`)
3. Apply addons (copy overlay files, apply patches, merge packages)
4. Replace `{{projectName}}` in all text files
5. Write `.spinitup.json`
6. Git init (if `--git`)
7. Install dependencies (if `--install`)
8. Run template-level `postCreateCommands` (if install succeeded)
9. Run addon-level `postCreateCommands` (if install succeeded)

## Full example: cloudflare-monorepo

```json
{
  "name": "Cloudflare Monorepo",
  "description": "Turborepo + Cloudflare Workers + Pages + D1 + KV",
  "packageManager": "pnpm",
  "postCreateCommands": [
    "pnpm exec turbo telemetry disable",
    "pnpm types",
    "pnpm dlx shadcn@latest add --all --cwd packages/ui"
  ],
  "addons": {
    "nextjs-dashboard": {
      "label": "Next.js Dashboard (Cloudflare Workers)",
      "description": "Adds apps/dashboard — a Next.js 15 app on Cloudflare Workers via OpenNext",
      "packages": {},
      "devPackages": {},
      "filesToCopy": "addons/nextjs-dashboard/",
      "patchFiles": {},
      "dependsOn": [],
      "conflictsWith": []
    },
    "agentic-skills": {
      "label": "Agentic Skills (Claude Code)",
      "description": "Installs Claude Code agent skills via the skills CLI",
      "packages": {},
      "devPackages": {},
      "filesToCopy": "",
      "patchFiles": {},
      "postCreateCommands": [
        "npx -y skills add https://github.com/cloudflare/skills --skill wrangler --agent claude-code --yes"
      ],
      "dependsOn": [],
      "conflictsWith": []
    },
    "durable-object-websocket": {
      "label": "Durable Object WebSocket",
      "description": "Adds a WebSocket hibernation server Durable Object",
      "packages": {},
      "devPackages": {},
      "filesToCopy": "addons/durable-object-websocket/",
      "patchFiles": {
        "apps/worker/wrangler.jsonc": {
          "mergeJson": {
            "durable_objects": {
              "bindings": [
                { "name": "WEBSOCKET_SERVER", "class_name": "WebSocketServer" }
              ]
            }
          }
        },
        "apps/worker/src/index.ts": {
          "prependLine": "export { WebSocketServer } from \"./websocket-server.js\";",
          "replaceText": {
            "find": "if (url.pathname === \"/health\")",
            "replace": "if (url.pathname === \"/websocket\") { ... }\n\n    if (url.pathname === \"/health\")"
          }
        }
      },
      "dependsOn": [],
      "conflictsWith": []
    }
  }
}
```

## File tree of cloudflare-monorepo base template

Reference for typical monorepo structure:

```
files/
  _gitignore
  _npmrc
  package.json
  pnpm-workspace.yaml
  turbo.json
  apps/
    worker/
      package.json
      src/index.ts
      tsconfig.json
      worker-configuration.d.ts
      wrangler.jsonc
  packages/
    config-eslint/
      index.js
      package.json
    shared-types/
      package.json
      src/index.ts
      tsconfig.json
    typescript-config/
      package.json
      nextjs.json
      workers.json
    ui/
      package.json
      components.json
      postcss.config.mjs
      tsconfig.json
      src/
        lib/theme-preset.ts
        lib/utils.ts
        styles/globals.css
```
