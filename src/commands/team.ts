import chalk from "chalk";
import * as api from "../api.js";
import * as config from "../config.js";
import { printJson, printError, makeTable } from "../output.js";
import { filterFields } from "../fields.js";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as Record<number, string>;
const STATUS = { a: "Available", d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable" } as Record<string, string>;

export async function teamCommand(asJson: boolean, fields?: string): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

  const picksData = await api.getMyTeam(teamId);

  const squad = picksData.picks.map((pick) => {
    const p = elements.get(pick.element)!;
    return {
      name: p.web_name,
      position: POS[p.element_type] ?? "???",
      team: teams.get(p.team) ?? "???",
      price: p.now_cost / 10,
      form: parseFloat(p.form),
      ppg: parseFloat(p.points_per_game),
      total_points: p.total_points,
      status: STATUS[p.status] ?? p.status,
      is_captain: pick.is_captain,
      is_vice_captain: pick.is_vice_captain,
      multiplier: pick.multiplier,
    };
  });

  if (asJson) { printJson(filterFields(squad, fields)); return; }

  const table = makeTable(["Name", "Pos", "Team", "Price", "Form", "PPG", "Pts", "Status", ""]);
  for (const p of squad) {
    const badge = p.is_captain ? " (C)" : p.is_vice_captain ? " (V)" : "";
    const status = p.status !== "Available" ? chalk.red(p.status) : p.status;
    const bench = p.multiplier === 0 ? chalk.dim("bench") : "";
    table.push([
      chalk.bold(p.name) + badge, p.position, p.team,
      chalk.green(`£${p.price.toFixed(1)}m`),
      chalk.yellow(String(p.form)), chalk.yellow(String(p.ppg)),
      String(p.total_points), status, bench,
    ]);
  }
  console.log(table.toString());
}

export async function budgetCommand(asJson: boolean, fields?: string): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const entry = await api.getEntry(teamId);
  const gw = await api.getCurrentGameweek();
  const picksData = await api.getMyTeam(teamId, gw);
  const h = picksData.entry_history;

  const chipsPlayed = (entry.chips ?? []).map((c) => c.name);
  const allChips = ["wildcard", "freehit", "bboost", "3xc"];
  const chipsAvailable = allChips.filter((c) => !chipsPlayed.includes(c));

  const data = {
    team_name: entry.name ?? "Unknown",
    bank: h.bank / 10,
    total_value: h.value / 10,
    overall_rank: entry.summary_overall_rank,
    total_points: entry.summary_overall_points,
    chips_available: chipsAvailable,
  };

  if (asJson) { printJson(filterFields(data, fields)); return; }

  console.log();
  console.log(`  ${chalk.bold(data.team_name)}`);
  console.log(`  Bank:          ${chalk.green(`£${data.bank.toFixed(1)}m`)}`);
  console.log(`  Total value:   ${chalk.green(`£${data.total_value.toFixed(1)}m`)}`);
  console.log(`  Overall rank:  ${chalk.yellow(data.overall_rank.toLocaleString())}`);
  console.log(`  Total points:  ${chalk.yellow(String(data.total_points))}`);
  console.log(`  Chips left:    ${chipsAvailable.join(", ") || "none"}`);
  console.log();
}
