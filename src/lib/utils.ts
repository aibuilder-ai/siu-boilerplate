import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEXT_FILE_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".yaml",
  ".yml",
  ".toml",
  ".md",
  ".html",
  ".css",
]);

/**
 * Resolve the templates/ directory relative to the built CLI.
 * Works in both dev (src/) and built (dist/) modes.
 */
export function getTemplatesDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // In built mode: dist/index.js → dist/templates/
  // tsup bundles into a single file, so __dirname = dist/
  const sameLevel = path.resolve(__dirname, "templates");
  if (fs.existsSync(sameLevel)) return sameLevel;
  // In dev mode: src/lib/utils.ts → src/templates/
  const parentLevel = path.resolve(__dirname, "..", "templates");
  if (fs.existsSync(parentLevel)) return parentLevel;
  // fallback: relative to cwd
  return path.resolve(process.cwd(), "src", "templates");
}

/**
 * Detect which package manager the user invoked with.
 */
export function detectPackageManager(): "pnpm" | "npm" | "yarn" | "bun" {
  const agent = process.env.npm_config_user_agent;
  if (!agent) return "pnpm";
  if (agent.startsWith("pnpm")) return "pnpm";
  if (agent.startsWith("yarn")) return "yarn";
  if (agent.startsWith("bun")) return "bun";
  return "npm";
}

/**
 * Validate npm package name.
 */
export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    name
  );
}

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not merged.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T];
    } else {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Check if a line already exists in a file (for idempotent appends).
 */
export async function fileContainsLine(
  filePath: string,
  line: string
): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;
  const content = await fs.promises.readFile(filePath, "utf-8");
  return content.includes(line.trim());
}

/**
 * Replace {{key}} placeholders in a string.
 */
export function replaceTemplateVars(
  content: string,
  vars: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
