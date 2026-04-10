import chalk from "chalk";
import * as api from "../api.js";
import * as config from "../config.js";
import { printJson, printError, makeTable } from "../output.js";
import { sanitizePlayerName } from "../validate.js";

const STATUS = { a: "Available", d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable" } as Record<string, string>;

export async function newsCommand(playerName: string | undefined, asJson: boolean): Promise<void> {
  if (playerName) {
    playerName = sanitizePlayerName(playerName, asJson);

    const p = await api.getPlayerByName(playerName);
    if (!p) printError(`Player not found: ${playerName}`, asJson);

    const bootstrap = await api.getBootstrap();
    const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

    const data = {
      name: p!.web_name,
      full_name: `${p!.first_name} ${p!.second_name}`,
      team: teams.get(p!.team) ?? "???",
      status: STATUS[p!.status] ?? p!.status,
      news: p!.news ?? "",
      news_added: p!.news_added ?? "",
      chance_next_round: p!.chance_of_playing_next_round,
    };

    if (asJson) { printJson(data); return; }

    console.log();
    console.log(`  ${chalk.bold(data.full_name)} (${data.team})`);
    console.log(`  Status: ${data.status}`);
    if (data.news) console.log(`  News: ${data.news}`);
    if (data.chance_next_round !== null) console.log(`  Chance of playing: ${data.chance_next_round}%`);
    console.log();
    return;
  }

  // Squad-wide injury check
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const picksData = await api.getMyTeam(teamId);

  const items = picksData.picks.map((pick) => {
    const p = elements.get(pick.element)!;
    return {
      name: p.web_name,
      status: STATUS[p.status] ?? p.status,
      status_code: p.status,
      news: p.news ?? "",
      chance_next_round: p.chance_of_playing_next_round,
    };
  });

  const flagged = items.filter((i) => i.status_code !== "a");
  const display = flagged.length > 0 ? flagged : items;

  if (asJson) { printJson(display); return; }

  if (flagged.length === 0) {
    console.log(`\n  ${chalk.green("All players available!")}\n`);
    return;
  }

  const table = makeTable(["Player", "Status", "News", "Chance"]);
  for (const i of display) {
    const chance = i.chance_next_round !== null ? `${i.chance_next_round}%` : "?";
    table.push([chalk.bold(i.name), chalk.red(i.status), i.news || "-", chalk.yellow(chance)]);
  }
  console.log(table.toString());
}
