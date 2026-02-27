# siu-boilerplate

CLI tool that scaffolds Cloudflare monorepo projects with Turborepo, Workers, and optional addons.

## Install

```bash
# From GitHub
pnpm add -g github:sustainbit/siu-boilerplate

# Or run directly after cloning
pnpm build
node dist/index.js
```

## Usage

```bash
# Interactive mode — prompts for everything
siu-boilerplate my-app

# Non-interactive
siu-boilerplate my-app -t cloudflare-monorepo -a nextjs-dashboard,agentic-skills

# List available templates
siu-boilerplate --list templates

# List addons for a template
siu-boilerplate --list addons -t cloudflare-monorepo
```

### Flags

| Flag | Description |
| --- | --- |
| `-t, --template <id>` | Template to use |
| `-a, --addons <ids>` | Comma-separated addon IDs |
| `--yes` | Accept all defaults |
| `--no-git` | Skip git init |
| `--no-install` | Skip dependency install |

## Templates

### `cloudflare-monorepo`

Turborepo monorepo with Cloudflare Workers, including:

- `apps/worker/` — Cloudflare Worker with Hono
- `packages/ui/` — Shared UI components (shadcn/ui + Tailwind v4)
- `packages/shared-types/` — Shared TypeScript types
- `packages/typescript-config/` — Shared tsconfig presets

#### Addons

| Addon | Description |
| --- | --- |
| `nextjs-dashboard` | Adds `apps/dashboard/` — Next.js 15 on Cloudflare Workers via OpenNext, with service binding to the worker |
| `agentic-skills` | Adds `.agents/skills/` — Claude Code skill definitions for Workers, Durable Objects, shadcn/ui, Wrangler, and more |

## Development

```bash
pnpm build        # Build CLI
pnpm dev          # Watch mode
pnpm typecheck    # Type-check
pnpm local        # Build + run locally
```
