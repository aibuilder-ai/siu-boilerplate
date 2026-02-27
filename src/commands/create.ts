import fs from "node:fs";
import { Command } from "commander";
import * as p from "@clack/prompts";
import {
  getTemplates,
  getTemplateMeta,
  getAddonOptions,
} from "../lib/template-registry.js";
import { isValidPackageName } from "../lib/utils.js";
import { scaffold, type ScaffoldConfig } from "../lib/scaffolder.js";

interface CreateOptions {
  template?: string;
  addons?: string;
  git?: boolean;
  install?: boolean;
  yes?: boolean;
}

async function resolveConfig(
  nameArg: string | undefined,
  opts: CreateOptions
): Promise<ScaffoldConfig | symbol> {
  // 1. Project name
  let projectName: string | symbol;
  if (nameArg) {
    // Validate the provided name
    if (!isValidPackageName(nameArg)) {
      p.log.error(`Invalid package name: "${nameArg}"`);
      process.exit(1);
    }
    if (fs.existsSync(nameArg)) {
      p.log.error(`Directory "${nameArg}" already exists.`);
      process.exit(1);
    }
    projectName = nameArg;
  } else if (opts.yes) {
    p.log.error("--yes requires a project name as positional argument.");
    process.exit(1);
  } else {
    projectName = await p.text({
      message: "Project name",
      placeholder: "my-app",
      validate: (val) => {
        if (!val) return "Required";
        if (!isValidPackageName(val)) return "Invalid package name";
        if (fs.existsSync(val)) return "Directory already exists";
      },
    });
    if (p.isCancel(projectName)) return projectName;
  }

  // 2. Template
  let template: string | symbol;
  if (opts.template) {
    // Validate template exists
    try {
      getTemplateMeta(opts.template);
    } catch {
      p.log.error(
        `Unknown template: "${opts.template}". Run --list templates to see available.`
      );
      process.exit(1);
    }
    template = opts.template;
  } else if (opts.yes) {
    p.log.error("--yes requires --template to be specified.");
    process.exit(1);
    template = ""; // unreachable
  } else {
    const templates = getTemplates();
    if (templates.length === 0) {
      p.log.error("No templates found.");
      process.exit(1);
    }
    template = (await p.select({
      message: "Pick a boilerplate",
      options: templates,
    })) as string | symbol;
    if (p.isCancel(template)) return template;
  }

  // 3. Addons
  let addons: string[];
  if (opts.addons) {
    addons = opts.addons.split(",").map((a) => a.trim());
    // Validate addon IDs
    const validAddons = getAddonOptions(template as string).map(
      (a) => a.value
    );
    const invalid = addons.filter((a) => !validAddons.includes(a));
    if (invalid.length > 0) {
      p.log.error(
        `Unknown addons: ${invalid.join(", ")}. Available: ${validAddons.join(", ")}`
      );
      process.exit(1);
    }
    // Check conflicts
    const meta = getTemplateMeta(template as string);
    for (const addonId of addons) {
      const addonMeta = meta.addons[addonId];
      if (addonMeta?.conflictsWith) {
        for (const conflict of addonMeta.conflictsWith) {
          if (addons.includes(conflict)) {
            p.log.error(
              `Conflicting addons: "${addonId}" and "${conflict}" cannot be used together.`
            );
            process.exit(1);
          }
        }
      }
    }
    // Auto-include dependencies
    for (const addonId of addons) {
      const addonMeta = meta.addons[addonId];
      if (addonMeta?.dependsOn) {
        for (const dep of addonMeta.dependsOn) {
          if (!addons.includes(dep)) {
            addons.push(dep);
            p.log.info(`Auto-including dependency: "${dep}" (required by "${addonId}")`);
          }
        }
      }
    }
  } else if (opts.yes) {
    addons = [];
  } else {
    const addonOptions = getAddonOptions(template as string);
    if (addonOptions.length > 0) {
      const selected = await p.multiselect({
        message: "Add packages/addons (space to select, enter to confirm)",
        options: addonOptions,
        required: false,
      });
      if (p.isCancel(selected)) return selected;
      addons = selected as string[];
    } else {
      addons = [];
    }
  }

  // 4. Git
  let git: boolean | symbol;
  if (opts.git !== undefined) {
    git = opts.git;
  } else if (opts.yes) {
    git = true;
  } else {
    git = await p.confirm({ message: "Initialize git?", initialValue: true });
    if (p.isCancel(git)) return git;
  }

  // 5. Install
  let install: boolean | symbol;
  if (opts.install !== undefined) {
    install = opts.install;
  } else if (opts.yes) {
    install = true;
  } else {
    install = await p.confirm({
      message: "Install dependencies?",
      initialValue: true,
    });
    if (p.isCancel(install)) return install;
  }

  return {
    projectName: projectName as string,
    template: template as string,
    addons,
    git: git as boolean,
    install: install as boolean,
  };
}

export const createCommand = new Command("create")
  .argument("[project-name]", "Name of the project")
  .option("-t, --template <id>", "Template to use")
  .option("-a, --addons <addons>", "Comma-separated addon IDs")
  .option("--git", "Initialize git repo")
  .option("--no-git", "Skip git init")
  .option("--install", "Install dependencies")
  .option("--no-install", "Skip dependency installation")
  .option("-y, --yes", "Accept all defaults (skip prompts)")
  .action(async (projectNameArg: string | undefined, opts: CreateOptions) => {
    p.intro("siu-boilerplate");

    // Validate: --yes requires --template
    if (opts.yes && !opts.template) {
      p.log.error("--yes requires --template to be specified.");
      process.exit(1);
    }

    const config = await resolveConfig(projectNameArg, opts);

    if (p.isCancel(config)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    await scaffold(config as ScaffoldConfig);

    p.outro("Project created!");
    const pm = "pnpm";
    console.log(`\n  cd ${(config as ScaffoldConfig).projectName}`);
    if (!(config as ScaffoldConfig).install) {
      console.log(`  ${pm} install`);
    }
    console.log(`  ${pm} dev\n`);
  });
