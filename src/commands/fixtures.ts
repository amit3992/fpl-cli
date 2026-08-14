import chalk from "chalk";
import * as api from "../api.js";
import { printJson, printError, makeTable, sanitizeText } from "../output.js";
import { sanitizePlayerName } from "../validate.js";

export async function fixturesCommand(playerName: string, gameweeks: number, asJson: boolean): Promise<void> {
  playerName = sanitizePlayerName(playerName, asJson);

  const p = await api.getPlayerByName(playerName);
  if (!p) printError(`Player not found: ${playerName}`, asJson);

  const bootstrap = await api.getBootstrap();
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));
  const allFixtures = await api.getFixtures();

  const teamId = p!.team;
  const upcoming: { gw: number; opponent: string; home: boolean; difficulty: number }[] = [];

  for (const f of allFixtures) {
    if (upcoming.length >= gameweeks) break;
    if (f.team_h === teamId) {
      upcoming.push({ gw: f.event, opponent: sanitizeText(teams.get(f.team_a) ?? "???"), home: true, difficulty: f.team_h_difficulty });
    } else if (f.team_a === teamId) {
      upcoming.push({ gw: f.event, opponent: sanitizeText(teams.get(f.team_h) ?? "???"), home: false, difficulty: f.team_a_difficulty });
    }
  }

  const data = { player: sanitizeText(p!.web_name), team: sanitizeText(teams.get(teamId) ?? "???"), fixtures: upcoming };

  if (asJson) { printJson(data); return; }

  console.log();
  console.log(`  ${chalk.bold(data.player)} (${data.team})`);
  const table = makeTable(["GW", "Opponent", "H/A", "FDR"]);
  for (const f of upcoming) {
    const fdr = f.difficulty <= 2 ? chalk.green(String(f.difficulty)) :
                f.difficulty >= 4 ? chalk.red(String(f.difficulty)) : String(f.difficulty);
    table.push([String(f.gw), f.opponent, f.home ? "H" : "A", fdr]);
  }
  console.log(table.toString());
}
