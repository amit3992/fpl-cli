import chalk from "chalk";
import * as api from "../api.js";
import { printJson, printError, makeTable, sanitizeText } from "../output.js";
import { sanitizePlayerName } from "../validate.js";
import { filterFields } from "../fields.js";
import { POS, STATUS } from "../constants.js";

export async function playerCommand(name: string, asJson: boolean, fields?: string): Promise<void> {
  name = sanitizePlayerName(name, asJson);

  const p = await api.getPlayerByName(name);
  if (!p) printError(`Player not found: ${name}`, asJson);

  const bootstrap = await api.getBootstrap();
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));
  const summary = await api.getPlayerSummary(p!.id);

  const recent = summary.history.slice(-5);
  const upcoming = summary.fixtures.slice(0, 5);

  const data = {
    name: sanitizeText(p!.web_name),
    full_name: sanitizeText(`${p!.first_name} ${p!.second_name}`),
    team: sanitizeText(teams.get(p!.team) ?? "???"),
    position: POS[p!.element_type] ?? "???",
    price: p!.now_cost / 10,
    form: parseFloat(p!.form),
    ppg: parseFloat(p!.points_per_game),
    total_points: p!.total_points,
    goals: p!.goals_scored,
    assists: p!.assists,
    clean_sheets: p!.clean_sheets,
    ict_index: parseFloat(p!.ict_index),
    xG: parseFloat(p!.expected_goals || "0"),
    xA: parseFloat(p!.expected_assists || "0"),
    selected_by: p!.selected_by_percent,
    status: STATUS[p!.status] ?? p!.status,
    news: sanitizeText(p!.news ?? ""),
    recent_gameweeks: recent.map((h) => ({
      gw: h.round, pts: h.total_points, mins: h.minutes,
      goals: h.goals_scored, assists: h.assists,
    })),
    upcoming_fixtures: upcoming.map((f) => ({
      gw: f.event,
      opponent: sanitizeText(teams.get(f.is_home ? f.team_a : f.team_h) ?? "???"),
      home: f.is_home,
      difficulty: f.difficulty,
    })),
  };

  if (asJson) { printJson(filterFields(data, fields)); return; }

  console.log();
  console.log(`  ${chalk.bold(data.full_name)} (${data.name})`);
  console.log(`  ${data.team} | ${data.position} | £${data.price.toFixed(1)}m`);
  console.log(`  Status: ${data.status}${data.news ? ` — ${data.news}` : ""}`);
  console.log();
  console.log(`  Form: ${chalk.yellow(String(data.form))}  PPG: ${chalk.yellow(String(data.ppg))}  Total: ${chalk.yellow(String(data.total_points))}`);
  console.log(`  Goals: ${data.goals}  Assists: ${data.assists}  CS: ${data.clean_sheets}`);
  console.log(`  ICT: ${data.ict_index}  xG: ${data.xG.toFixed(2)}  xA: ${data.xA.toFixed(2)}`);
  console.log(`  Selected by: ${data.selected_by}%`);
  console.log();

  if (data.recent_gameweeks.length) {
    const t = makeTable(["GW", "Pts", "Mins", "Goals", "Assists"]);
    for (const gw of data.recent_gameweeks) {
      t.push([String(gw.gw), chalk.yellow(String(gw.pts)), String(gw.mins), String(gw.goals), String(gw.assists)]);
    }
    console.log(t.toString());
  }

  if (data.upcoming_fixtures.length) {
    const t = makeTable(["GW", "Opponent", "H/A", "FDR"]);
    for (const f of data.upcoming_fixtures) {
      const fdr = f.difficulty <= 2 ? chalk.green(String(f.difficulty)) :
                  f.difficulty >= 4 ? chalk.red(String(f.difficulty)) : String(f.difficulty);
      t.push([String(f.gw), f.opponent, f.home ? "H" : "A", fdr]);
    }
    console.log(t.toString());
  }
}
