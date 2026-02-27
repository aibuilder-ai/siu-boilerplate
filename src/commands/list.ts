import { getTemplates, getTemplateMeta } from "../lib/template-registry.js";
import color from "picocolors";

export function listHandler(type: string, templateId?: string): void {
  if (type === "templates") {
    const templates = getTemplates();
    if (templates.length === 0) {
      console.error(color.red("No templates found."));
      process.exit(1);
    }
    console.log(color.bold("\nAvailable templates:\n"));
    for (const t of templates) {
      console.log(`  ${color.cyan(t.value)}  — ${t.hint}`);
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
      console.log(color.bold(`\nAddons for ${meta.name}:\n`));
      for (const [key, addon] of Object.entries(meta.addons)) {
        console.log(`  ${color.cyan(key)}  — ${addon.label}`);
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
