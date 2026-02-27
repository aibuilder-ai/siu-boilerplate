import fs from "node:fs";
import path from "node:path";
import fse from "fs-extra";
import * as p from "@clack/prompts";
import { execa } from "execa";
import {
  TEXT_FILE_EXTENSIONS,
  deepMerge,
  fileContainsLine,
  replaceTemplateVars,
  getTemplatesDir,
} from "./utils.js";
import {
  getTemplateMeta,
  type AddonConfig,
  type PatchOperations,
} from "./template-registry.js";

export interface ScaffoldConfig {
  projectName: string;
  template: string;
  addons: string[];
  git: boolean;
  install: boolean;
}

interface SpinItUpJson {
  template: string;
  installedAddons: string[];
  createdAt: string;
  cliVersion: string;
}

/**
 * Main scaffold function — copies template files, applies addons, replaces
 * template vars, optionally inits git and installs dependencies.
 */
export async function scaffold(config: ScaffoldConfig): Promise<void> {
  const { projectName, template, addons, git, install } = config;
  const meta = getTemplateMeta(template);
  const templatesDir = getTemplatesDir();
  const templateDir = path.join(templatesDir, template);
  const dest = path.resolve(process.cwd(), projectName);

  // 1. Copy base files
  const s = p.spinner();
  s.start("Copying template files...");
  const filesDir = path.join(templateDir, "files");
  await fse.copy(filesDir, dest);
  s.stop("Template files copied.");

  // 2. Apply addons
  if (addons.length > 0) {
    s.start(`Applying addons: ${addons.join(", ")}...`);
    await applyAddons(dest, templateDir, meta, addons);
    s.stop("Addons applied.");
  }

  // 3. Replace {{projectName}} in all text files
  s.start("Replacing template variables...");
  await walkAndReplace(dest, { projectName });
  s.stop("Template variables replaced.");

  // 4. Write .spinitup.json
  const spinitup: SpinItUpJson = {
    template,
    installedAddons: addons,
    createdAt: new Date().toISOString(),
    cliVersion: "1.0.0",
  };
  await fse.writeJson(path.join(dest, ".spinitup.json"), spinitup, {
    spaces: 2,
  });

  // 5. Git init
  if (git) {
    s.start("Initializing git repository...");
    try {
      await execa("git", ["init"], { cwd: dest });
      await execa("git", ["add", "-A"], { cwd: dest });
      s.stop("Git repository initialized.");
    } catch {
      s.stop("git not found, skipping init.");
    }
  }

  // 6. Install dependencies
  if (install) {
    const pm = meta.packageManager || "pnpm";
    s.start(`Installing dependencies with ${pm}...`);
    try {
      await execa(pm, ["install"], { cwd: dest });
      s.stop("Dependencies installed.");
    } catch {
      s.stop(`Failed to run ${pm} install. Run it manually.`);
    }
  }

  // 7. Post-create commands
  if (meta.postCreateCommands && meta.postCreateCommands.length > 0) {
    for (const cmd of meta.postCreateCommands) {
      // Skip the install command if we already ran it
      if (install && cmd.includes("install")) continue;

      s.start(`Running: ${cmd}...`);
      try {
        const [bin, ...args] = cmd.split(" ");
        await execa(bin, args, { cwd: dest });
        s.stop(`Completed: ${cmd}`);
      } catch {
        s.stop(`Failed: ${cmd}. Run it manually.`);
      }
    }
  }
}

/**
 * Apply addons to an existing project directory.
 * Exported for reuse by the `add` command.
 */
export async function applyAddons(
  dest: string,
  templateDir: string,
  meta: ReturnType<typeof getTemplateMeta>,
  addonIds: string[]
): Promise<void> {
  for (const addonId of addonIds) {
    const addon = meta.addons[addonId];
    if (!addon) {
      p.log.warn(`Addon "${addonId}" not found in template, skipping.`);
      continue;
    }

    // a. Copy addon files
    if (addon.filesToCopy) {
      const addonSrc = path.join(templateDir, addon.filesToCopy);
      if (fs.existsSync(addonSrc)) {
        await fse.copy(addonSrc, dest, { overwrite: true });
      }
    }

    // b. Apply patch files
    if (addon.patchFiles) {
      for (const [relPath, ops] of Object.entries(addon.patchFiles)) {
        const targetFile = path.join(dest, relPath);
        await applyPatch(targetFile, ops);
      }
    }

    // c. Merge packages into root package.json dependencies
    if (addon.packages && Object.keys(addon.packages).length > 0) {
      await mergeIntoPackageJson(
        path.join(dest, "package.json"),
        "dependencies",
        addon.packages
      );
    }

    // d. Merge devPackages into root package.json devDependencies
    if (addon.devPackages && Object.keys(addon.devPackages).length > 0) {
      await mergeIntoPackageJson(
        path.join(dest, "package.json"),
        "devDependencies",
        addon.devPackages
      );
    }
  }
}

/**
 * Apply a single patch operation set to a file.
 */
async function applyPatch(
  filePath: string,
  ops: PatchOperations
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    p.log.warn(`Patch target not found: ${filePath}, skipping.`);
    return;
  }

  if (ops.mergeJson) {
    const existing = await fse.readJson(filePath);
    const merged = deepMerge(existing, ops.mergeJson as Record<string, unknown>);
    await fse.writeJson(filePath, merged, { spaces: 2 });
  }

  if (ops.appendLine) {
    const alreadyExists = await fileContainsLine(filePath, ops.appendLine);
    if (!alreadyExists) {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const newContent = content.endsWith("\n")
        ? content + ops.appendLine + "\n"
        : content + "\n" + ops.appendLine + "\n";
      await fs.promises.writeFile(filePath, newContent, "utf-8");
    }
  }

  if (ops.prependLine) {
    const alreadyExists = await fileContainsLine(filePath, ops.prependLine);
    if (!alreadyExists) {
      const content = await fs.promises.readFile(filePath, "utf-8");
      await fs.promises.writeFile(
        filePath,
        ops.prependLine + "\n" + content,
        "utf-8"
      );
    }
  }

  if (ops.replaceText) {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const updated = content.replace(
      ops.replaceText.find,
      ops.replaceText.replace
    );
    await fs.promises.writeFile(filePath, updated, "utf-8");
  }
}

/**
 * Merge dependencies into a package.json file.
 */
async function mergeIntoPackageJson(
  pkgPath: string,
  field: "dependencies" | "devDependencies",
  packages: Record<string, string>
): Promise<void> {
  if (!fs.existsSync(pkgPath)) return;
  const pkg = await fse.readJson(pkgPath);
  pkg[field] = { ...(pkg[field] || {}), ...packages };
  await fse.writeJson(pkgPath, pkg, { spaces: 2 });
}

/**
 * Walk all text files in a directory and replace template variables.
 */
async function walkAndReplace(
  dir: string,
  vars: Record<string, string>
): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walkAndReplace(fullPath, vars);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TEXT_FILE_EXTENSIONS.has(ext)) {
        const content = await fs.promises.readFile(fullPath, "utf-8");
        const replaced = replaceTemplateVars(content, vars);
        if (replaced !== content) {
          await fs.promises.writeFile(fullPath, replaced, "utf-8");
        }
      }
    }
  }
}
