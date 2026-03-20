import fs from "node:fs";
import path from "node:path";
import { getTemplatesDir } from "./utils.js";

export interface PatchOperations {
  mergeJson?: Record<string, unknown>;
  appendLine?: string;
  prependLine?: string;
  replaceText?: { find: string; replace: string };
}

export interface AddonConfig {
  label: string;
  description: string;
  packages: Record<string, string>;
  devPackages: Record<string, string>;
  filesToCopy: string;
  patchFiles: Record<string, PatchOperations>;
  postCreateCommands?: string[];
  dependsOn: string[];
  conflictsWith: string[];
}

export interface TemplateConfig {
  name: string;
  description: string;
  packageManager: "pnpm" | "npm" | "bun";
  /**
   * Remote source for template files in giget format.
   * e.g. "github:your-org/siu-templates/cloudflare-monorepo"
   * When set, the CLI fetches files from this URL instead of the bundled copy.
   * When absent, falls back to bundled files in dist/templates/.
   */
  source?: string;
  /**
   * Subdirectory within the downloaded/local template dir that contains the
   * actual project files to copy. Defaults to "files" (bundled layout).
   * Set to "." when the GitHub repo root IS the template (flat repo).
   */
  filesDir?: string;
  postCreateCommands?: string[];
  addons: Record<string, AddonConfig>;
}

// In-memory cache for a single CLI run
const cache = new Map<string, TemplateConfig>();

/**
 * Returns list of available templates with metadata for use in select prompts.
 */
export function getTemplates(): {
  value: string;
  label: string;
  hint: string;
}[] {
  const templatesDir = getTemplatesDir();
  if (!fs.existsSync(templatesDir)) return [];

  const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
  const templates: { value: string; label: string; hint: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // skip example templates

    const templateJsonPath = path.join(
      templatesDir,
      entry.name,
      "template.json"
    );
    if (!fs.existsSync(templateJsonPath)) continue;

    const meta = getTemplateMeta(entry.name);
    templates.push({
      value: entry.name,
      label: meta.name,
      hint: meta.description,
    });
  }

  return templates;
}

/**
 * Returns template.json content for a given template.
 */
export function getTemplateMeta(templateId: string): TemplateConfig {
  if (cache.has(templateId)) return cache.get(templateId)!;

  const templatesDir = getTemplatesDir();
  const templateJsonPath = path.join(
    templatesDir,
    templateId,
    "template.json"
  );

  if (!fs.existsSync(templateJsonPath)) {
    throw new Error(
      `Unknown template: "${templateId}". Run --list templates to see available.`
    );
  }

  const raw = fs.readFileSync(templateJsonPath, "utf-8");
  const config: TemplateConfig = JSON.parse(raw);
  cache.set(templateId, config);
  return config;
}

/**
 * Returns addon options for multiselect prompts.
 * If installedAddons is provided, those are filtered out.
 */
export function getAddonOptions(
  templateId: string,
  installedAddons?: string[]
): { value: string; label: string; hint: string }[] {
  const meta = getTemplateMeta(templateId);
  const installed = new Set(installedAddons ?? []);

  return Object.entries(meta.addons)
    .filter(([key]) => !installed.has(key))
    .map(([key, addon]) => ({
      value: key,
      label: addon.label,
      hint: addon.description,
    }));
}
