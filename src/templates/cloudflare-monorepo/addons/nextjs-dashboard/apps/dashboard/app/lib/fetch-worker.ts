import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Call the worker via service binding (zero-cost, no network hop).
 * Falls back to HTTP for local dev where service bindings aren't available.
 */
export async function fetchWorker(
  path: string,
  init?: RequestInit
): Promise<Response> {
  try {
    const { env } = getCloudflareContext();
    return env.EXAMPLE_WORKER.fetch(
      `https://{{projectName}}-worker${path}`,
      init
    );
  } catch {
    // Local dev fallback — service bindings aren't available outside Cloudflare
    return fetch(`${process.env.EXAMPLE_WORKER_URL}${path}`, init);
  }
}
