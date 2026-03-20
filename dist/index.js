#!/usr/bin/env node

// src/index.ts
import { Command as Command3 } from "commander";

// src/commands/create.ts
import fs4 from "fs";
import { Command } from "commander";
import * as p2 from "@clack/prompts";

// src/lib/template-registry.ts
import fs2 from "fs";
import path2 from "path";

// src/lib/utils.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var TEXT_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
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
  ".css"
]);
function getTemplatesDir() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const sameLevel = path.resolve(__dirname, "templates");
  if (fs.existsSync(sameLevel)) return sameLevel;
  const parentLevel = path.resolve(__dirname, "..", "templates");
  if (fs.existsSync(parentLevel)) return parentLevel;
  return path.resolve(process.cwd(), "src", "templates");
}
function isValidPackageName(name) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    name
  );
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (sourceVal && typeof sourceVal === "object" && !Array.isArray(sourceVal) && targetVal && typeof targetVal === "object" && !Array.isArray(targetVal)) {
      result[key] = deepMerge(
        targetVal,
        sourceVal
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}
async function fileContainsLine(filePath, line) {
  if (!fs.existsSync(filePath)) return false;
  const content = await fs.promises.readFile(filePath, "utf-8");
  return content.includes(line.trim());
}
function replaceTemplateVars(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// src/lib/template-registry.ts
var cache = /* @__PURE__ */ new Map();
function getTemplates() {
  const templatesDir = getTemplatesDir();
  if (!fs2.existsSync(templatesDir)) return [];
  const entries = fs2.readdirSync(templatesDir, { withFileTypes: true });
  const templates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;
    const templateJsonPath = path2.join(
      templatesDir,
      entry.name,
      "template.json"
    );
    if (!fs2.existsSync(templateJsonPath)) continue;
    const meta = getTemplateMeta(entry.name);
    templates.push({
      value: entry.name,
      label: meta.name,
      hint: meta.description
    });
  }
  return templates;
}
function getTemplateMeta(templateId) {
  if (cache.has(templateId)) return cache.get(templateId);
  const templatesDir = getTemplatesDir();
  const templateJsonPath = path2.join(
    templatesDir,
    templateId,
    "template.json"
  );
  if (!fs2.existsSync(templateJsonPath)) {
    throw new Error(
      `Unknown template: "${templateId}". Run --list templates to see available.`
    );
  }
  const raw = fs2.readFileSync(templateJsonPath, "utf-8");
  const config = JSON.parse(raw);
  cache.set(templateId, config);
  return config;
}
function getAddonOptions(templateId, installedAddons) {
  const meta = getTemplateMeta(templateId);
  const installed = new Set(installedAddons ?? []);
  return Object.entries(meta.addons).filter(([key]) => !installed.has(key)).map(([key, addon]) => ({
    value: key,
    label: addon.label,
    hint: addon.description
  }));
}

// src/lib/scaffolder.ts
import fs3 from "fs";
import path3 from "path";
import fse from "fs-extra";
import * as p from "@clack/prompts";
import { execa } from "execa";
import { downloadTemplate } from "giget";
async function scaffold(config) {
  const { projectName, template, addons, git, install } = config;
  const meta = getTemplateMeta(template);
  const dest = path3.resolve(process.cwd(), projectName);
  const s = p.spinner();
  let templateDir;
  if (meta.source) {
    s.start("Fetching template...");
    const result = await downloadTemplate(meta.source, { preferOffline: true });
    templateDir = result.dir;
    s.stop("Template fetched.");
  } else {
    const templatesDir = getTemplatesDir();
    templateDir = path3.join(templatesDir, template);
  }
  s.start("Copying template files...");
  const filesDir = path3.join(templateDir, meta.filesDir ?? "files");
  await fse.copy(filesDir, dest);
  await renameDotfiles(dest);
  s.stop("Template files copied.");
  let addonCommands = [];
  if (addons.length > 0) {
    s.start(`Applying addons: ${addons.join(", ")}...`);
    addonCommands = await applyAddons(dest, templateDir, meta, addons);
    s.stop("Addons applied.");
  }
  s.start("Replacing template variables...");
  await walkAndReplace(dest, { projectName });
  s.stop("Template variables replaced.");
  const spinitup = {
    template,
    installedAddons: addons,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    cliVersion: "1.0.0"
  };
  await fse.writeJson(path3.join(dest, ".spinitup.json"), spinitup, {
    spaces: 2
  });
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
  if (install && meta.postCreateCommands && meta.postCreateCommands.length > 0) {
    for (const cmd of meta.postCreateCommands) {
      if (cmd.includes("pnpm install") || cmd.includes("npm install")) continue;
      s.start(`Running: ${cmd}...`);
      try {
        await execa(cmd, { cwd: dest, shell: true });
        s.stop(`Completed: ${cmd}`);
      } catch {
        s.stop(`Failed: ${cmd}. Run it manually.`);
      }
    }
  }
  if (install && addonCommands.length > 0) {
    for (const cmd of addonCommands) {
      s.start(`Running: ${cmd}...`);
      try {
        await execa(cmd, { cwd: dest, shell: true });
        s.stop(`Completed: ${cmd}`);
      } catch {
        s.stop(`Failed: ${cmd}. Run it manually.`);
      }
    }
  }
}
async function applyAddons(dest, templateDir, meta, addonIds) {
  const addonCommands = [];
  for (const addonId of addonIds) {
    const addon = meta.addons[addonId];
    if (!addon) {
      p.log.warn(`Addon "${addonId}" not found in template, skipping.`);
      continue;
    }
    if (addon.filesToCopy) {
      const addonSrc = path3.join(templateDir, addon.filesToCopy);
      if (fs3.existsSync(addonSrc)) {
        await fse.copy(addonSrc, dest, { overwrite: true });
      }
    }
    if (addon.patchFiles) {
      for (const [relPath, ops] of Object.entries(addon.patchFiles)) {
        const targetFile = path3.join(dest, relPath);
        await applyPatch(targetFile, ops);
      }
    }
    if (addon.packages && Object.keys(addon.packages).length > 0) {
      await mergeIntoPackageJson(
        path3.join(dest, "package.json"),
        "dependencies",
        addon.packages
      );
    }
    if (addon.devPackages && Object.keys(addon.devPackages).length > 0) {
      await mergeIntoPackageJson(
        path3.join(dest, "package.json"),
        "devDependencies",
        addon.devPackages
      );
    }
    if (addon.postCreateCommands) {
      addonCommands.push(...addon.postCreateCommands);
    }
  }
  return addonCommands;
}
async function applyPatch(filePath, ops) {
  if (!fs3.existsSync(filePath)) {
    p.log.warn(`Patch target not found: ${filePath}, skipping.`);
    return;
  }
  if (ops.mergeJson) {
    const existing = await fse.readJson(filePath);
    const merged = deepMerge(existing, ops.mergeJson);
    await fse.writeJson(filePath, merged, { spaces: 2 });
  }
  if (ops.appendLine) {
    const alreadyExists = await fileContainsLine(filePath, ops.appendLine);
    if (!alreadyExists) {
      const content = await fs3.promises.readFile(filePath, "utf-8");
      const newContent = content.endsWith("\n") ? content + ops.appendLine + "\n" : content + "\n" + ops.appendLine + "\n";
      await fs3.promises.writeFile(filePath, newContent, "utf-8");
    }
  }
  if (ops.prependLine) {
    const alreadyExists = await fileContainsLine(filePath, ops.prependLine);
    if (!alreadyExists) {
      const content = await fs3.promises.readFile(filePath, "utf-8");
      await fs3.promises.writeFile(
        filePath,
        ops.prependLine + "\n" + content,
        "utf-8"
      );
    }
  }
  if (ops.replaceText) {
    const content = await fs3.promises.readFile(filePath, "utf-8");
    const updated = content.replace(
      ops.replaceText.find,
      ops.replaceText.replace
    );
    await fs3.promises.writeFile(filePath, updated, "utf-8");
  }
}
async function mergeIntoPackageJson(pkgPath, field, packages) {
  if (!fs3.existsSync(pkgPath)) return;
  const pkg = await fse.readJson(pkgPath);
  pkg[field] = { ...pkg[field] || {}, ...packages };
  await fse.writeJson(pkgPath, pkg, { spaces: 2 });
}
var DOTFILE_RENAMES = {
  _gitignore: ".gitignore",
  _npmrc: ".npmrc"
};
async function renameDotfiles(dir) {
  const entries = await fs3.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await renameDotfiles(fullPath);
    } else if (entry.isFile() && DOTFILE_RENAMES[entry.name]) {
      const newPath = path3.join(dir, DOTFILE_RENAMES[entry.name]);
      await fs3.promises.rename(fullPath, newPath);
    }
  }
}
async function walkAndReplace(dir, vars) {
  const entries = await fs3.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walkAndReplace(fullPath, vars);
    } else if (entry.isFile()) {
      const ext = path3.extname(entry.name);
      if (TEXT_FILE_EXTENSIONS.has(ext)) {
        const content = await fs3.promises.readFile(fullPath, "utf-8");
        const replaced = replaceTemplateVars(content, vars);
        if (replaced !== content) {
          await fs3.promises.writeFile(fullPath, replaced, "utf-8");
        }
      }
    }
  }
}

// src/commands/create.ts
async function resolveConfig(nameArg, opts) {
  let projectName;
  if (nameArg) {
    if (!isValidPackageName(nameArg)) {
      p2.log.error(`Invalid package name: "${nameArg}"`);
      process.exit(1);
    }
    if (fs4.existsSync(nameArg)) {
      p2.log.error(`Directory "${nameArg}" already exists.`);
      process.exit(1);
    }
    projectName = nameArg;
  } else if (opts.yes) {
    p2.log.error("--yes requires a project name as positional argument.");
    process.exit(1);
  } else {
    projectName = await p2.text({
      message: "Project name",
      placeholder: "my-app",
      validate: (val) => {
        if (!val) return "Required";
        if (!isValidPackageName(val)) return "Invalid package name";
        if (fs4.existsSync(val)) return "Directory already exists";
      }
    });
    if (p2.isCancel(projectName)) return projectName;
  }
  let template;
  if (opts.template) {
    try {
      getTemplateMeta(opts.template);
    } catch {
      p2.log.error(
        `Unknown template: "${opts.template}". Run --list templates to see available.`
      );
      process.exit(1);
    }
    template = opts.template;
  } else if (opts.yes) {
    p2.log.error("--yes requires --template to be specified.");
    process.exit(1);
    template = "";
  } else {
    const templates = getTemplates();
    if (templates.length === 0) {
      p2.log.error("No templates found.");
      process.exit(1);
    }
    template = await p2.select({
      message: "Pick a boilerplate",
      options: templates
    });
    if (p2.isCancel(template)) return template;
  }
  let addons;
  if (opts.addons) {
    addons = opts.addons.split(",").map((a) => a.trim());
    const validAddons = getAddonOptions(template).map(
      (a) => a.value
    );
    const invalid = addons.filter((a) => !validAddons.includes(a));
    if (invalid.length > 0) {
      p2.log.error(
        `Unknown addons: ${invalid.join(", ")}. Available: ${validAddons.join(", ")}`
      );
      process.exit(1);
    }
    const meta = getTemplateMeta(template);
    for (const addonId of addons) {
      const addonMeta = meta.addons[addonId];
      if (addonMeta?.conflictsWith) {
        for (const conflict of addonMeta.conflictsWith) {
          if (addons.includes(conflict)) {
            p2.log.error(
              `Conflicting addons: "${addonId}" and "${conflict}" cannot be used together.`
            );
            process.exit(1);
          }
        }
      }
    }
    for (const addonId of addons) {
      const addonMeta = meta.addons[addonId];
      if (addonMeta?.dependsOn) {
        for (const dep of addonMeta.dependsOn) {
          if (!addons.includes(dep)) {
            addons.push(dep);
            p2.log.info(`Auto-including dependency: "${dep}" (required by "${addonId}")`);
          }
        }
      }
    }
  } else if (opts.yes) {
    addons = [];
  } else {
    const addonOptions = getAddonOptions(template);
    if (addonOptions.length > 0) {
      const selected = await p2.multiselect({
        message: "Add packages/addons (space to select, enter to confirm)",
        options: addonOptions,
        required: false
      });
      if (p2.isCancel(selected)) return selected;
      addons = selected;
    } else {
      addons = [];
    }
  }
  let git;
  if (opts.git !== void 0) {
    git = opts.git;
  } else if (opts.yes) {
    git = true;
  } else {
    git = await p2.confirm({ message: "Initialize git?", initialValue: true });
    if (p2.isCancel(git)) return git;
  }
  let install;
  if (opts.install !== void 0) {
    install = opts.install;
  } else if (opts.yes) {
    install = true;
  } else {
    install = await p2.confirm({
      message: "Install dependencies?",
      initialValue: true
    });
    if (p2.isCancel(install)) return install;
  }
  return {
    projectName,
    template,
    addons,
    git,
    install
  };
}
var createCommand = new Command("create").argument("[project-name]", "Name of the project").option("-t, --template <id>", "Template to use").option("-a, --addons <addons>", "Comma-separated addon IDs").option("--git", "Initialize git repo").option("--no-git", "Skip git init").option("--install", "Install dependencies").option("--no-install", "Skip dependency installation").option("-y, --yes", "Accept all defaults (skip prompts)").action(async (projectNameArg, opts) => {
  p2.intro("siu-boilerplate");
  if (opts.yes && !opts.template) {
    p2.log.error("--yes requires --template to be specified.");
    process.exit(1);
  }
  const config = await resolveConfig(projectNameArg, opts);
  if (p2.isCancel(config)) {
    p2.cancel("Cancelled.");
    process.exit(0);
  }
  await scaffold(config);
  p2.outro("Project created!");
  const pm = "pnpm";
  console.log(`
  cd ${config.projectName}`);
  if (!config.install) {
    console.log(`  ${pm} install`);
  }
  console.log(`  ${pm} dev
`);
});

// src/commands/add.ts
import fs5 from "fs";
import path4 from "path";
import fse2 from "fs-extra";
import { Command as Command2 } from "commander";
import * as p3 from "@clack/prompts";
import { execa as execa2 } from "execa";
var addCommand = new Command2("add").description("Add addons to an existing project").action(async () => {
  p3.intro("siu-boilerplate add");
  const spinitupPath = path4.resolve(process.cwd(), ".spinitup.json");
  if (!fs5.existsSync(spinitupPath)) {
    p3.log.error(
      "This directory was not created with siu-boilerplate. No .spinitup.json found."
    );
    process.exit(1);
  }
  const spinitup = await fse2.readJson(spinitupPath);
  const { template, installedAddons } = spinitup;
  const available = getAddonOptions(template, installedAddons);
  if (available.length === 0) {
    p3.log.info("All addons are already installed!");
    p3.outro("Nothing to do.");
    return;
  }
  const selected = await p3.multiselect({
    message: "Select addons to add",
    options: available,
    required: false
  });
  if (p3.isCancel(selected)) {
    p3.cancel("Cancelled.");
    process.exit(0);
  }
  const addonIds = selected;
  if (addonIds.length === 0) {
    p3.log.info("No addons selected.");
    p3.outro("Nothing to do.");
    return;
  }
  const meta = getTemplateMeta(template);
  const templatesDir = getTemplatesDir();
  const templateDir = path4.join(templatesDir, template);
  const dest = process.cwd();
  const s = p3.spinner();
  s.start(`Applying addons: ${addonIds.join(", ")}...`);
  const addonCommands = await applyAddons(dest, templateDir, meta, addonIds);
  const pkgPath = path4.join(dest, "package.json");
  let projectName = "my-app";
  if (fs5.existsSync(pkgPath)) {
    const pkg = await fse2.readJson(pkgPath);
    projectName = pkg.name || "my-app";
  }
  s.stop("Addons applied.");
  const pm = meta.packageManager || "pnpm";
  s.start(`Installing dependencies with ${pm}...`);
  try {
    await execa2(pm, ["install"], { cwd: dest });
    s.stop("Dependencies installed.");
  } catch {
    s.stop(`Failed to run ${pm} install. Run it manually.`);
  }
  if (addonCommands.length > 0) {
    for (const cmd of addonCommands) {
      s.start(`Running: ${cmd}...`);
      try {
        await execa2(cmd, { cwd: dest, shell: true });
        s.stop(`Completed: ${cmd}`);
      } catch {
        s.stop(`Failed: ${cmd}. Run it manually.`);
      }
    }
  }
  spinitup.installedAddons = [...installedAddons, ...addonIds];
  await fse2.writeJson(spinitupPath, spinitup, { spaces: 2 });
  p3.outro("Addons added successfully!");
});

// src/commands/list.ts
import color from "picocolors";
function listHandler(type, templateId) {
  if (type === "templates") {
    const templates = getTemplates();
    if (templates.length === 0) {
      console.error(color.red("No templates found."));
      process.exit(1);
    }
    console.log(color.bold("\nAvailable templates:\n"));
    for (const t of templates) {
      console.log(`  ${color.cyan(t.value)}  \u2014 ${t.hint}`);
    }
    console.log();
  } else if (type === "addons") {
    if (!templateId) {
      console.error(
        color.red("Error: --template is required with --list addons")
      );
      console.error(
        "  Example: siu-boilerplate --list addons -t cloudflare-monorepo"
      );
      process.exit(1);
    }
    try {
      const meta = getTemplateMeta(templateId);
      console.log(color.bold(`
Addons for ${meta.name}:
`));
      for (const [key, addon] of Object.entries(meta.addons)) {
        console.log(`  ${color.cyan(key)}  \u2014 ${addon.label}`);
        if (addon.description) {
          console.log(`    ${color.dim(addon.description)}`);
        }
      }
      console.log();
    } catch (err) {
      console.error(
        color.red(
          `Unknown template: "${templateId}". Run --list templates to see available.`
        )
      );
      process.exit(1);
    }
  } else {
    console.error(
      color.red(`Unknown list type: "${type}". Use "templates" or "addons".`)
    );
    process.exit(1);
  }
}

// src/index.ts
var program = new Command3().name("siu-boilerplate").version("1.0.0").description("Scaffold boilerplate projects").enablePositionalOptions().passThroughOptions().option("--list <type>", "List available templates or addons").hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.list) {
    let templateId;
    const argv = process.argv;
    const tIdx = argv.indexOf("-t");
    const tLongIdx = argv.indexOf("--template");
    if (tIdx !== -1 && tIdx + 1 < argv.length) {
      templateId = argv[tIdx + 1];
    } else if (tLongIdx !== -1 && tLongIdx + 1 < argv.length) {
      templateId = argv[tLongIdx + 1];
    }
    listHandler(opts.list, templateId);
    process.exit(0);
  }
});
program.addCommand(createCommand, { isDefault: true });
program.addCommand(addCommand);
program.parse();
