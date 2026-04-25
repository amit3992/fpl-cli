#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { loginCommand, logoutCommand } from "./commands/login.js";
import { teamCommand, budgetCommand, captainCommand, chipCommand } from "./commands/team.js";
import { playerCommand } from "./commands/player.js";
import { newsCommand } from "./commands/news.js";
import { fixturesCommand } from "./commands/fixtures.js";
import { suggestCommand, hitCommand, executeCommand } from "./commands/transfers.js";
import { doctorCommand } from "./commands/doctor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("fpl")
  .version(pkg.version)
  .description("Command-line tool for Fantasy Premier League")
  .option("--json", "Output JSON instead of human-readable text");

function json(): boolean {
  return program.opts().json ?? false;
}

program.command("init")
  .description("Set up your FPL credentials")
  .option("--team-id <id>", "FPL Team ID (non-interactive)")
  .option("--email <email>", "FPL email (non-interactive)")
  .option("--password <password>", "FPL password (non-interactive)")
  .action((opts: { teamId?: string; email?: string; password?: string }) =>
    initCommand(opts, json()));

program.command("login")
  .description("Authenticate with FPL to enable transfers")
  .action(() => loginCommand(json()));

program.command("logout")
  .description("Clear stored authentication tokens")
  .action(() => logoutCommand(json()));

program.command("team")
  .description("Show your live FPL squad (reflects pending transfers/captain). Falls back to current GW picks if not logged in.")
  .option("--gw <n>", "Show historical squad for a specific past gameweek (no auth needed)")
  .option("--fields <fields>", "Comma-separated list of fields to include in JSON output (applied to squad entries)")
  .action((opts: { fields?: string; gw?: string }) => {
    let gw: number | undefined;
    if (opts.gw !== undefined) {
      gw = parseInt(opts.gw, 10);
      if (Number.isNaN(gw) || gw < 1) {
        console.error("Error: --gw must be a positive integer");
        process.exit(1);
      }
    }
    return teamCommand(json(), opts.fields, gw);
  });

program.command("captain")
  .description("Set captain for next gameweek")
  .argument("<player>", "Player name")
  .action((player: string) => captainCommand(player, false, json()));

program.command("vice-captain")
  .description("Set vice-captain for next gameweek")
  .argument("<player>", "Player name")
  .action((player: string) => captainCommand(player, true, json()));

program.command("chip")
  .description("Activate or deactivate a chip (dry-run by default)")
  .argument("[name]", "Chip name: wildcard, freehit, bboost, 3xc, none (deactivate)")
  .option("--confirm", "Actually apply the chip change")
  .option("--input-json <json>", 'JSON input: \'{"chip":"wildcard","confirm":true}\'')
  .action((name: string | undefined, opts: { confirm?: boolean; inputJson?: string }) => {
    if (!opts.inputJson && !name) {
      console.error("Error: provide a chip name or --input-json");
      process.exit(1);
    }
    return chipCommand(name ?? "", opts.confirm ?? false, json(), opts.inputJson);
  });

program.command("budget")
  .description("Show your bank balance, transfers, and chips")
  .option("--fields <fields>", "Comma-separated list of fields to include in JSON output")
  .action((opts: { fields?: string }) => budgetCommand(json(), opts.fields));

program.command("player")
  .description("Show detailed stats for a player")
  .argument("<name>", "Player name")
  .option("--fields <fields>", "Comma-separated list of fields to include in JSON output")
  .action((name: string, opts: { fields?: string }) => playerCommand(name, json(), opts.fields));

program.command("news")
  .description("Show injury/availability news")
  .argument("[player]", "Optional player name")
  .action((player?: string) => newsCommand(player, json()));

program.command("fixtures")
  .description("Show upcoming fixture difficulty for a player")
  .argument("<player>", "Player name")
  .option("-n, --gameweeks <n>", "Number of gameweeks", "5")
  .action((player: string, opts: { gameweeks: string }) =>
    fixturesCommand(player, parseInt(opts.gameweeks, 10), json()));

const transfers = program.command("transfers")
  .description("Transfer analysis and execution");

transfers.command("suggest")
  .description("Find top 5 replacement options for a player")
  .argument("<player>", "Player to replace")
  .action((player: string) => suggestCommand(player, json()));

transfers.command("hit")
  .description("Calculate whether a transfer hit is worth taking")
  .argument("[player-out]", "Player to sell")
  .argument("[player-in]", "Player to buy")
  .option("--horizon <n>", "Gameweeks to project over", "3")
  .option("--input-json <json>", 'JSON input: \'{"out":"Salah","in":"Palmer"}\'')
  .action((playerOut: string | undefined, playerIn: string | undefined, opts: { horizon: string; inputJson?: string }) => {
    if (!opts.inputJson && (!playerOut || !playerIn)) {
      console.error("Error: provide player names or --input-json");
      process.exit(1);
    }
    return hitCommand(playerOut ?? "", playerIn ?? "", parseInt(opts.horizon, 10), json(), opts.inputJson);
  });

transfers.command("execute")
  .description("Execute a transfer (dry-run by default)")
  .argument("[player-out]", "Player to transfer out")
  .argument("[player-in]", "Player to transfer in")
  .option("--confirm", "Actually confirm the transfer (irreversible)")
  .option("--input-json <json>", 'JSON input: \'{"out":"Salah","in":"Palmer","confirm":true}\'')
  .action((playerOut: string | undefined, playerIn: string | undefined, opts: { confirm?: boolean; inputJson?: string }) => {
    if (!opts.inputJson && (!playerOut || !playerIn)) {
      console.error("Error: provide player names or --input-json");
      process.exit(1);
    }
    return executeCommand(playerOut ?? "", playerIn ?? "", opts.confirm ?? false, json(), opts.inputJson);
  });

program.command("doctor")
  .description("Check your configuration and API connectivity")
  .action(() => doctorCommand(json()));

program.parse();
