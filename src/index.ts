#!/usr/bin/env node
import { Command } from "commander";
import { createCommand } from "./commands/create.js";
import { addCommand } from "./commands/add.js";
import { listHandler } from "./commands/list.js";

const program = new Command()
  .name("siu-boilerplate")
  .version("1.0.0")
  .description("Scaffold boilerplate projects")
  .enablePositionalOptions()
  .passThroughOptions()
  .option("--list <type>", "List available templates or addons")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.list) {
      // For --list addons, grab -t from argv since we pass through options
      let templateId: string | undefined;
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
