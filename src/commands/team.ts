import chalk from "chalk";
import * as api from "../api.js";
import * as auth from "../auth.js";
import * as config from "../config.js";
import { printJson, printError, makeTable } from "../output.js";
import { filterFields } from "../fields.js";
import { sanitizePlayerName } from "../validate.js";
import { computePlanId, computeSquadFingerprint } from "../plans.js";
import { POS, STATUS, CHIP_NAMES } from "../constants.js";

const STRUCTURAL_CHIPS = new Set(["wildcard", "freehit"]);
const LINEUP_CHIPS = new Set(["bboost", "3xc"]);
const VALID_CHIPS = ["wildcard", "freehit", "bboost", "3xc", "none"];

interface ChipInput {
  chip: string;
  confirm?: boolean;
  plan_id?: string;
}

// Slim default field set for `fpl team` JSON output (agents rarely need form/ppg/total).
// --fields overrides this; --full restores the complete set.
const SLIM_TEAM_FIELDS = [
  "name", "position", "team", "price", "status",
  "is_captain", "is_vice_captain", "multiplier",
];

export async function teamCommand(asJson: boolean, fields?: string, gw?: number, full = false): Promise<void> {
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
    const effectiveFields = fields ?? (full ? undefined : SLIM_TEAM_FIELDS.join(","));
    output.squad = filterFields(squad, effectiveFields);
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

export async function captainCommand(
  playerName: string,
  vice: boolean,
  confirm: boolean,
  asJson: boolean,
  planId?: string,
): Promise<void> {
  playerName = sanitizePlayerName(playerName, asJson);

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const token = await auth.getAccessToken();
  if (!token) printError("Not logged in. Run: fpl login", asJson, "AUTH_REQUIRED");

  if (confirm && !planId) {
    printError("Plan ID required. Run the dry-run first and pass --plan-id <id>.", asJson, "INPUT_ERROR");
  }

  const player = await api.getPlayerByName(playerName);
  if (!player) printError(`Player not found: ${playerName}`, asJson);

  const myTeam = await api.getMySquad(teamId);
  const picks = myTeam.picks;

  const inSquad = picks.find((p) => p.element === player!.id);
  if (!inSquad) printError(`${player!.web_name} is not in your squad.`, asJson);

  const label = vice ? "vice-captain" : "captain";
  const alreadySet = vice ? inSquad!.is_vice_captain : inSquad!.is_captain;

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const prevPick = picks.find((p) => (vice ? p.is_vice_captain : p.is_captain));
  const previous =
    prevPick && prevPick.element !== player!.id ? elements.get(prevPick.element)?.web_name ?? null : null;

  const gameweek = await api.getNextGameweek();
  const deadline = (await api.getNextDeadline()) ?? "";
  const armedChip = myTeam.chips.find((c) => c.status_for_entry === "active")?.name ?? null;
  const squadFingerprint = computeSquadFingerprint(picks, myTeam.transfers.bank, armedChip, gameweek, deadline);
  const currentPlanId = computePlanId({
    action: label,
    params: { player_id: player!.id },
    gameweek,
    deadline,
    squadFingerprint,
  });

  const data: Record<string, unknown> = {
    mode: confirm ? "confirmed" : "dry_run",
    action: label,
    player: player!.web_name,
    team_id: teamId,
    previous,
    already_set: alreadySet,
    plan_id: currentPlanId,
    squad_fingerprint: squadFingerprint,
    deadline: deadline || null,
  };

  if (!confirm) {
    if (asJson) { printJson(data); return; }
    console.log();
    console.log(chalk.bold(`  Set ${player!.web_name} as ${label} (dry run):`));
    if (previous) console.log(chalk.dim(`  Currently: ${previous}`));
    else if (alreadySet) console.log(chalk.dim(`  ${player!.web_name} is already ${label}.`));
    console.log(chalk.dim(`  Plan ID: ${currentPlanId}`));
    console.log(chalk.dim(`  Re-run with --confirm --plan-id ${currentPlanId} to apply.`));
    console.log();
    return;
  }

  if (planId !== currentPlanId) {
    printError(
      "Plan is stale — squad state changed since the dry-run (price, picks, captain, chip, or deadline). Re-run the dry-run for a fresh plan_id.",
      asJson,
      "STALE_PLAN",
    );
  }

  for (const pick of picks) {
    if (vice) {
      pick.is_vice_captain = pick.element === player!.id;
    } else {
      pick.is_captain = pick.element === player!.id;
    }
  }

  await api.updateMyTeam(teamId, picks);

  if (asJson) { printJson(data); return; }
  console.log(chalk.green(`  ${player!.web_name} set as ${label}.`));
}

export async function chipCommand(
  chipName: string,
  confirm: boolean,
  asJson: boolean,
  jsonInput?: string,
  planId?: string,
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
    planId = parsed!.plan_id ?? planId;
  }

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const token = await auth.getAccessToken();
  if (!token) printError("Not logged in. Run: fpl login", asJson, "AUTH_REQUIRED");

  if (confirm && !planId) {
    printError("Plan ID required. Run the dry-run first and pass --plan-id <id>.", asJson, "INPUT_ERROR");
  }

  const chip = chipName.toLowerCase();
  if (!VALID_CHIPS.includes(chip)) {
    printError(`Invalid chip: ${chipName}. Valid: ${VALID_CHIPS.join(", ")}`, asJson);
  }

  const myTeam = await api.getMySquad(teamId);
  const deadline = (await api.getNextDeadline()) ?? "";
  const gameweek = await api.getNextGameweek();

  if (chip === "none") {
    return deactivateChip(teamId, myTeam, gameweek, deadline, confirm, asJson, planId);
  }

  const status = myTeam.chips.find((c) => c.name === chip);
  if (!status || status.status_for_entry !== "available") {
    printError(
      `Chip "${CHIP_NAMES[chip]}" is not available (status: ${status?.status_for_entry ?? "not found"}).`,
      asJson,
    );
  }

  const armedChip = myTeam.chips.find((c) => c.status_for_entry === "active")?.name ?? null;
  const squadFingerprint = computeSquadFingerprint(myTeam.picks, myTeam.transfers.bank, armedChip, gameweek, deadline);
  const currentPlanId = computePlanId({
    action: "chip_activate",
    params: { chip },
    gameweek,
    deadline,
    squadFingerprint,
  });

  const data = {
    action: "activate",
    chip,
    chip_label: CHIP_NAMES[chip],
    mode: confirm ? "confirmed" : "dry_run",
    reversible: true,
    deadline: deadline || null,
    plan_id: currentPlanId,
    squad_fingerprint: squadFingerprint,
  };

  if (!confirm) {
    if (asJson) { printJson(data); return; }
    console.log();
    console.log(chalk.bold(`  Activate ${CHIP_NAMES[chip]} (dry run):`));
    console.log(chalk.dim(`  Reversible until ${data.deadline ?? "GW deadline"} via: fpl chip none --confirm --plan-id <id>`));
    console.log(chalk.dim(`  Plan ID: ${currentPlanId}`));
    console.log(chalk.dim(`  Re-run with --confirm --plan-id ${currentPlanId} to activate.`));
    console.log();
    return;
  }

  if (planId !== currentPlanId) {
    printError(
      "Plan is stale — squad state changed since the dry-run (price, picks, captain, chip, or deadline). Re-run the dry-run for a fresh plan_id.",
      asJson,
      "STALE_PLAN",
    );
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
  gameweek: number,
  deadline: string,
  confirm: boolean,
  asJson: boolean,
  planId?: string,
): Promise<void> {
  // Pre-check before building any dry-run plan: if no chip is armed, `chip none`
  // (dry-run OR confirm) has nothing to deactivate. Failing here keeps a dry-run
  // from succeeding and then having --confirm fail. See AGENTS.md known issues.
  const active = myTeam.chips.find((c) => c.status_for_entry === "active");
  if (!active) {
    printError(
      "No chip is currently armed, so there is nothing to deactivate. Arm one with `fpl chip <name>` first.",
      asJson,
      "INPUT_ERROR",
    );
  }

  if (confirm && !planId) {
    printError("Plan ID required. Run the dry-run first and pass --plan-id <id>.", asJson, "INPUT_ERROR");
  }

  const squadFingerprint = computeSquadFingerprint(myTeam.picks, myTeam.transfers.bank, active!.name, gameweek, deadline);
  const currentPlanId = computePlanId({
    action: "chip_deactivate",
    params: { chip: active!.name },
    gameweek,
    deadline,
    squadFingerprint,
  });

  const data = {
    action: "deactivate",
    chip: active!.name,
    chip_label: CHIP_NAMES[active!.name] ?? active!.name,
    mode: confirm ? "confirmed" : "dry_run",
    deadline: deadline || null,
    plan_id: currentPlanId,
    squad_fingerprint: squadFingerprint,
  };

  if (!confirm) {
    if (asJson) { printJson(data); return; }
    console.log();
    console.log(chalk.bold(`  Deactivate ${data.chip_label} (dry run):`));
    console.log(chalk.dim(`  Plan ID: ${currentPlanId}`));
    console.log(chalk.dim(`  Re-run with --confirm --plan-id ${currentPlanId} to deactivate.`));
    console.log();
    return;
  }

  if (planId !== currentPlanId) {
    printError(
      "Plan is stale — squad state changed since the dry-run (price, picks, captain, chip, or deadline). Re-run the dry-run for a fresh plan_id.",
      asJson,
      "STALE_PLAN",
    );
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
  const rankStr = data.overall_rank != null ? data.overall_rank.toLocaleString() : "—";
  const pointsStr = data.total_points != null ? String(data.total_points) : "—";
  console.log(`  Overall rank:  ${chalk.yellow(rankStr)}`);
  console.log(`  Total points:  ${chalk.yellow(pointsStr)}`);
  console.log(`  Chips left:    ${chipsAvailable.join(", ") || "none"}`);
  if (chipsActive.length > 0) console.log(`  Chip armed:    ${chalk.cyan(chipsActive.join(", "))}`);
  if (state.caveat) console.log(chalk.dim(`  ${chalk.yellow("(not logged in — pending changes not shown)")}`));
  console.log();
}
