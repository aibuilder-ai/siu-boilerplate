import { fetchWorker } from "@/app/lib/fetch-worker";

/**
 * Example API route demonstrating Cloudflare service bindings.
 * Calls the worker's /health endpoint via zero-cost service binding.
 *
 * GET /api/hello → proxies to worker /health
 */
export async function GET() {
  const res = await fetchWorker("/health");
  const data = await res.json();

  return Response.json({ worker: data });
}
