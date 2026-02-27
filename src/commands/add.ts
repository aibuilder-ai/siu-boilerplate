import fs from "node:fs";
import path from "node:path";
import fse from "fs-extra";
import { Command } from "commander";
import * as p from "@clack/prompts";
import { execa } from "execa";
import {
  getTemplateMeta,
  getAddonOptions,
} from "../lib/template-registry.js";
import { getTemplatesDir } from "../lib/utils.js";
import { applyAddons } from "../lib/scaffolder.js";

interface SpinItUpJson {
  template: string;
  installedAddons: string[];
  createdAt: string;
  cliVersion: string;
}

export const addCommand = new Command("add")
  .description("Add addons to an existing project")
  .action(async () => {
    p.intro("siu-boilerplate add");

    const spinitupPath = path.resolve(process.cwd(), ".spinitup.json");

    if (!fs.existsSync(spinitupPath)) {
      p.log.error(
        "This directory was not created with siu-boilerplate. No .spinitup.json found."
      );
      process.exit(1);
    }

    const spinitup: SpinItUpJson = await fse.readJson(spinitupPath);
    const { template, installedAddons } = spinitup;

    // Get available addons (not already installed)
    const available = getAddonOptions(template, installedAddons);

    if (available.length === 0) {
      p.log.info("All addons are already installed!");
      p.outro("Nothing to do.");
      return;
    }

    const selected = await p.multiselect({
      message: "Select addons to add",
      options: available,
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    const addonIds = selected as string[];

    if (addonIds.length === 0) {
      p.log.info("No addons selected.");
      p.outro("Nothing to do.");
      return;
    }

    const meta = getTemplateMeta(template);
    const templatesDir = getTemplatesDir();
    const templateDir = path.join(templatesDir, template);
    const dest = process.cwd();

    // Apply addons
    const s = p.spinner();
    s.start(`Applying addons: ${addonIds.join(", ")}...`);
    await applyAddons(dest, templateDir, meta, addonIds);

    // Replace template vars in new files
    // Read projectName from package.json
    const pkgPath = path.join(dest, "package.json");
    let projectName = "my-app";
    if (fs.existsSync(pkgPath)) {
      const pkg = await fse.readJson(pkgPath);
      projectName = pkg.name || "my-app";
    }
    s.stop("Addons applied.");

    // Install dependencies
    const pm = meta.packageManager || "pnpm";
    s.start(`Installing dependencies with ${pm}...`);
    try {
      await execa(pm, ["install"], { cwd: dest });
      s.stop("Dependencies installed.");
    } catch {
      s.stop(`Failed to run ${pm} install. Run it manually.`);
    }

    // Update .spinitup.json
    spinitup.installedAddons = [...installedAddons, ...addonIds];
    await fse.writeJson(spinitupPath, spinitup, { spaces: 2 });

    p.outro("Addons added successfully!");
  });
