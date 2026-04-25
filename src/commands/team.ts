import chalk from "chalk";
import * as api from "../api.js";
import * as auth from "../auth.js";
import * as config from "../config.js";
import { printJson, printError, makeTable } from "../output.js";
import { filterFields } from "../fields.js";
import { sanitizePlayerName } from "../validate.js";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as Record<number, string>;
const STATUS = { a: "Available", d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable" } as Record<string, string>;
const CHIP_NAMES: Record<string, string> = {
  wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain",
};
const STRUCTURAL_CHIPS = new Set(["wildcard", "freehit"]);
const LINEUP_CHIPS = new Set(["bboost", "3xc"]);
const VALID_CHIPS = ["wildcard", "freehit", "bboost", "3xc", "none"];

interface ChipInput {
  chip: string;
  confirm?: boolean;
}

export async function teamCommand(asJson: boolean, fields?: string, gw?: number): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

  let picks: api.Pick[];
  let source: "live" | "historical";
  let viewGw: number;
  let caveat: string | null = null;

  if (gw !== undefined) {
    const picksData = await api.getMyTeam(teamId, gw);
    picks = picksData.picks;
    source = "historical";
    viewGw = gw;
  } else {
    const state = await api.getLiveSquadState(teamId);
    picks = state.picks;
    source = state.source;
    viewGw = state.gameweek;
    caveat = state.caveat;
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

  if (asJson) {
    const output: Record<string, unknown> = { gameweek: viewGw, source };
    if (caveat) output.caveat = caveat;
    output.squad = filterFields(squad, fields);
    printJson(output);
    return;
  }

  if (source === "live") console.log(chalk.dim(`  Live squad for GW ${viewGw} (reflects pending transfers/captain):`));
  else if (gw !== undefined) console.log(chalk.dim(`  Historical squad for GW ${viewGw}:`));
  else console.log(chalk.dim(`  Squad for GW ${viewGw} ${chalk.yellow("(not logged in — pending changes not shown)")}`));
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

export async function chipCommand(
  chipName: string,
  confirm: boolean,
  asJson: boolean,
  jsonInput?: string,
): Promise<void> {
  if (jsonInput) {
    let parsed: ChipInput;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      printError("Invalid JSON input.", asJson);
    }
    if (!parsed!.chip) printError('JSON input must include "chip" field.', asJson);
    chipName = parsed!.chip;
    confirm = parsed!.confirm ?? confirm;
  }

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const token = await auth.getAccessToken();
  if (!token) printError("Not logged in. Run: fpl login", asJson);

  const chip = chipName.toLowerCase();
  if (!VALID_CHIPS.includes(chip)) {
    printError(`Invalid chip: ${chipName}. Valid: ${VALID_CHIPS.join(", ")}`, asJson);
  }

  const myTeam = await api.getMySquad(teamId);
  const deadline = await api.getNextDeadline();
  const gameweek = await api.getNextGameweek();

  if (chip === "none") {
    return deactivateChip(teamId, myTeam, gameweek, deadline, confirm, asJson);
  }

  const status = myTeam.chips.find((c) => c.name === chip);
  if (!status || status.status_for_entry !== "available") {
    printError(
      `Chip "${CHIP_NAMES[chip]}" is not available (status: ${status?.status_for_entry ?? "not found"}).`,
      asJson,
    );
  }

  const data = {
    action: "activate",
    chip,
    chip_label: CHIP_NAMES[chip],
    mode: confirm ? "confirmed" : "dry_run",
    reversible: true,
    deadline,
  };

  if (!confirm) {
    if (asJson) { printJson(data); return; }
    console.log();
    console.log(chalk.bold(`  Activate ${CHIP_NAMES[chip]} (dry run):`));
    console.log(chalk.dim(`  Reversible until ${deadline ?? "GW deadline"} via: fpl chip none --confirm`));
    console.log(chalk.dim("  Re-run with --confirm to activate."));
    console.log();
    return;
  }

  if (LINEUP_CHIPS.has(chip)) {
    await api.updateMyTeam(teamId, myTeam.picks, chip);
  } else {
    await api.makeTransfer({
      teamId,
      gameweek,
      transfers: [],
      confirm: true,
      wildcard: chip === "wildcard",
      freehit: chip === "freehit",
    });
  }

  const result = { ...data, status: "activated" };
  if (asJson) { printJson(result); return; }
  console.log(chalk.green(`  ${CHIP_NAMES[chip]} activated.`));
}

async function deactivateChip(
  teamId: string,
  myTeam: api.MyTeamData,
  _gameweek: number,
  deadline: string | null,
  confirm: boolean,
  asJson: boolean,
): Promise<void> {
  const active = myTeam.chips.find((c) => c.status_for_entry === "active");
  if (!active) printError("No active chip to deactivate.", asJson);

  const data = {
    action: "deactivate",
    chip: active!.name,
    chip_label: CHIP_NAMES[active!.name] ?? active!.name,
    mode: confirm ? "confirmed" : "dry_run",
    deadline,
  };

  if (!confirm) {
    if (asJson) { printJson(data); return; }
    console.log();
    console.log(chalk.bold(`  Deactivate ${data.chip_label} (dry run):`));
    console.log(chalk.dim("  Re-run with --confirm to deactivate."));
    console.log();
    return;
  }

  await api.updateMyTeam(teamId, myTeam.picks, null);

  const result = { ...data, status: "deactivated" };
  if (asJson) { printJson(result); return; }
  console.log(chalk.green(`  ${data.chip_label} deactivated.`));
}

export async function budgetCommand(asJson: boolean, fields?: string): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const entry = await api.getEntry(teamId);
  const state = await api.getLiveSquadState(teamId);

  let chipsAvailable: string[];
  let chipsActive: string[];
  let chipsPlayed: string[];

  if (state.source === "live") {
    chipsAvailable = state.chips.filter((c) => c.status === "available").map((c) => c.name);
    chipsActive = state.chips.filter((c) => c.status === "active").map((c) => c.name);
    chipsPlayed = state.chips.filter((c) => c.status === "played").map((c) => c.name);
  } else {
    const allChips = ["wildcard", "freehit", "bboost", "3xc"];
    chipsPlayed = (entry.chips ?? []).map((c) => c.name);
    chipsAvailable = allChips.filter((c) => !chipsPlayed.includes(c));
    chipsActive = [];
  }

  const data = {
    team_name: entry.name ?? "Unknown",
    bank: state.bank / 10,
    total_value: state.team_value / 10,
    overall_rank: entry.summary_overall_rank,
    total_points: entry.summary_overall_points,
    gameweek: state.gameweek,
    source: state.source,
    caveat: state.caveat ?? undefined,
    chips_available: chipsAvailable,
    chips_active: chipsActive,
    chips_played: chipsPlayed,
  };

  if (asJson) { printJson(filterFields(data, fields)); return; }

  console.log();
  console.log(`  ${chalk.bold(data.team_name)}`);
  console.log(`  Bank:          ${chalk.green(`£${data.bank.toFixed(1)}m`)}`);
  console.log(`  Total value:   ${chalk.green(`£${data.total_value.toFixed(1)}m`)}`);
  console.log(`  Overall rank:  ${chalk.yellow(data.overall_rank.toLocaleString())}`);
  console.log(`  Total points:  ${chalk.yellow(String(data.total_points))}`);
  console.log(`  Chips left:    ${chipsAvailable.join(", ") || "none"}`);
  if (chipsActive.length > 0) console.log(`  Chip armed:    ${chalk.cyan(chipsActive.join(", "))}`);
  if (state.caveat) console.log(chalk.dim(`  ${chalk.yellow("(not logged in — pending changes not shown)")}`));
  console.log();
}
