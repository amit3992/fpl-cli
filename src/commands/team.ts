import chalk from "chalk";
import * as api from "../api.js";
import * as config from "../config.js";
import { printJson, printError, makeTable } from "../output.js";
import { filterFields } from "../fields.js";
import { sanitizePlayerName } from "../validate.js";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as Record<number, string>;
const STATUS = { a: "Available", d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable" } as Record<string, string>;
const CHIP_NAMES: Record<string, string> = {
  wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain",
};

export async function teamCommand(asJson: boolean, fields?: string, next?: boolean): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

  let picks: api.Pick[];
  if (next) {
    const myTeam = await api.getMySquad(teamId);
    picks = myTeam.picks;
  } else {
    const picksData = await api.getMyTeam(teamId);
    picks = picksData.picks;
  }

  const squad = picks.map((pick) => {
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

  if (next) console.log(chalk.dim("  Next gameweek squad:"));
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

export async function captainCommand(playerName: string, vice: boolean, asJson: boolean): Promise<void> {
  playerName = sanitizePlayerName(playerName, asJson);

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const player = await api.getPlayerByName(playerName);
  if (!player) printError(`Player not found: ${playerName}`, asJson);

  const myTeam = await api.getMySquad(teamId);
  const picks = myTeam.picks;

  const inSquad = picks.find((p) => p.element === player!.id);
  if (!inSquad) printError(`${player!.web_name} is not in your squad.`, asJson);

  for (const pick of picks) {
    if (vice) {
      pick.is_vice_captain = pick.element === player!.id;
    } else {
      pick.is_captain = pick.element === player!.id;
    }
  }

  await api.updateMyTeam(teamId, picks);

  const label = vice ? "vice-captain" : "captain";
  const data = { [label]: player!.web_name, status: "confirmed" };

  if (asJson) { printJson(data); return; }
  console.log(chalk.green(`  ${player!.web_name} set as ${label}.`));
}

export async function chipCommand(chipName: string, asJson: boolean): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const validChips = ["wildcard", "freehit", "bboost", "3xc"];
  const chip = chipName.toLowerCase();
  if (!validChips.includes(chip)) {
    printError(`Invalid chip: ${chipName}. Valid chips: ${validChips.join(", ")}`, asJson);
  }

  const myTeam = await api.getMySquad(teamId);

  const chipStatus = myTeam.chips.find((c) => c.name === chip);
  if (!chipStatus || chipStatus.status_for_entry !== "available") {
    printError(`Chip "${CHIP_NAMES[chip] ?? chip}" is not available.`, asJson);
  }

  await api.updateMyTeam(teamId, myTeam.picks, chip);

  const data = { chip: CHIP_NAMES[chip] ?? chip, status: "activated" };

  if (asJson) { printJson(data); return; }
  console.log(chalk.green(`  ${CHIP_NAMES[chip] ?? chip} activated.`));
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
