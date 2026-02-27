// This file is a placeholder so TypeScript can resolve CloudflareEnv before
// you run `pnpm types`. After running `pnpm types`, wrangler will overwrite
// this file with the generated environment interface.

interface CloudflareEnv {
  ASSETS: Fetcher;
  EXAMPLE_WORKER: Fetcher;
  EXAMPLE_WORKER_URL: string;
}
