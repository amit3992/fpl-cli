import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import * as config from "../config.js";
import { printJson, printError } from "../output.js";

export interface InitOptions {
  teamId?: string;
  email?: string;
  password?: string;
}

async function ask(rl: ReturnType<typeof createInterface>, label: string, existing: string, required: boolean): Promise<string> {
  const req = required ? chalk.red("(required)") : chalk.dim("(optional)");
  const hint = existing ? chalk.dim(` [Enter to keep current]`) : "";
  const value = await rl.question(`  ${label} ${req}${hint}: `);
  return value.trim() || existing;
}

async function askHidden(label: string, existing: string): Promise<string> {
  const muted = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  const rl = createInterface({ input: stdin, output: muted, terminal: true });
  const hint = existing ? " [Enter to keep current]" : "";
  stdout.write(`  ${label} (optional)${hint}: `);
  const value = await rl.question("");
  rl.close();
  stdout.write("\n");
  return value.trim() || existing;
}

export async function initCommand(opts: InitOptions, asJson: boolean): Promise<void> {
  const existing = config.load();

  // Non-interactive mode: if --team-id is provided, skip prompts
  if (opts.teamId) {
    if (!config.isValidTeamId(opts.teamId)) {
      printError("--team-id must be 1-10 digits.", asJson, "INPUT_ERROR");
    }
    const cfg: config.Config = {
      FPL_TEAM_ID: opts.teamId,
      FPL_EMAIL: process.env.FPL_EMAIL ?? opts.email ?? existing.FPL_EMAIL,
      FPL_PASSWORD: process.env.FPL_PASSWORD ?? opts.password ?? existing.FPL_PASSWORD,
    };
    config.save(cfg);

    if (asJson) {
      printJson({ status: "configured", config_file: config.CONFIG_FILE });
    } else {
      console.log(chalk.green(`Config saved to ${config.CONFIG_FILE}`));
    }
    return;
  }

  // Interactive mode
  const rl = createInterface({ input: stdin, output: stdout });

  console.log();
  console.log(chalk.green.bold("  FPL CLI Setup"));
  console.log(chalk.dim("  Config saved to ~/.config/fpl-cli/config.json"));
  console.log();

  const cfg: config.Config = {};

  cfg.FPL_TEAM_ID = await ask(rl, "FPL Team ID (from fantasy.premierleague.com/entry/XXXX/)", existing.FPL_TEAM_ID ?? "", true);
  if (!config.isValidTeamId(cfg.FPL_TEAM_ID)) {
    printError("--team-id must be 1-10 digits.", asJson, "INPUT_ERROR");
  }
  console.log();
  console.log(chalk.dim("  FPL login is only needed for executing transfers."));
  cfg.FPL_EMAIL = await ask(rl, "FPL Email", existing.FPL_EMAIL ?? "", false);
  cfg.FPL_PASSWORD = await askHidden("FPL Password", existing.FPL_PASSWORD ?? "");

  rl.close();

  config.save(cfg);
  console.log();
  console.log(chalk.green(`  Config saved to ${config.CONFIG_FILE}`));
  console.log();
}
