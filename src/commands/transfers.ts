import chalk from "chalk";
import * as api from "../api.js";
import * as auth from "../auth.js";
import * as config from "../config.js";
import { rankPlayersByPosition, calculateHitValue } from "../scoring.js";
import { printJson, printError, makeTable } from "../output.js";
import { sanitizePlayerName } from "../validate.js";
import { computePlanId, computeSquadFingerprint } from "../plans.js";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as Record<number, string>;

interface TransferInput {
  out: string;
  in: string;
  confirm?: boolean;
  horizon?: number;
  plan_id?: string;
}

function parseJsonInput(jsonStr: string, asJson: boolean): TransferInput {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.out || !parsed.in) {
      printError('JSON input must include "out" and "in" fields.', asJson);
    }
    return parsed as TransferInput;
  } catch {
    printError("Invalid JSON input.", asJson);
  }
}

export async function suggestCommand(playerName: string, asJson: boolean): Promise<void> {
  playerName = sanitizePlayerName(playerName, asJson);

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const playerOut = await api.getPlayerByName(playerName);
  if (!playerOut) printError(`Player not found: ${playerName}`, asJson);

  const bootstrap = await api.getBootstrap();
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));
  const fixtures = await api.getFixtures();

  const state = await api.getLiveSquadState(teamId);
  const budget = state.bank + playerOut!.now_cost;

  const myIds = new Set(state.picks.map((p) => p.element));
  const position = playerOut!.element_type;

  const candidates = bootstrap.elements.filter(
    (p) => p.element_type === position && p.now_cost <= budget && !myIds.has(p.id) && p.status === "a",
  );

  const ranked = rankPlayersByPosition(candidates, position, fixtures).slice(0, 5);

  const data = {
    player_out: { name: playerOut!.web_name, position: POS[position] ?? "???", price: playerOut!.now_cost / 10 },
    budget: budget / 10,
    source: state.source,
    caveat: state.caveat ?? undefined,
    recommendations: ranked.map((p) => ({
      name: p.web_name, team: teams.get(p.team) ?? "???",
      price: p.now_cost / 10, form: parseFloat(p.form),
      ppg: parseFloat(p.points_per_game), score: Math.round(p.composite_score * 100) / 100,
    })),
  };

  if (asJson) { printJson(data); return; }

  console.log();
  console.log(`  Replacing ${chalk.bold(data.player_out.name)} (${data.player_out.position}, £${data.player_out.price.toFixed(1)}m)`);
  console.log(`  Budget: ${chalk.green(`£${data.budget.toFixed(1)}m`)}`);

  const table = makeTable(["#", "Name", "Team", "Price", "Form", "PPG", "Score"]);
  data.recommendations.forEach((r, i) => {
    table.push([
      String(i + 1), chalk.bold(r.name), r.team,
      chalk.green(`£${r.price.toFixed(1)}m`),
      chalk.yellow(String(r.form)), chalk.yellow(String(r.ppg)),
      chalk.cyan(String(r.score)),
    ]);
  });
  console.log(table.toString());
}

export async function hitCommand(
  playerOut: string, playerIn: string, horizon: number, asJson: boolean,
  jsonInput?: string,
): Promise<void> {
  if (jsonInput) {
    const input = parseJsonInput(jsonInput, asJson);
    playerOut = input.out;
    playerIn = input.in;
    horizon = input.horizon ?? horizon;
  }

  playerOut = sanitizePlayerName(playerOut, asJson);
  playerIn = sanitizePlayerName(playerIn, asJson);

  const pOut = await api.getPlayerByName(playerOut);
  const pIn = await api.getPlayerByName(playerIn);
  if (!pOut) printError(`Player not found: ${playerOut}`, asJson);
  if (!pIn) printError(`Player not found: ${playerIn}`, asJson);

  const fixtures = await api.getFixtures();
  const result = calculateHitValue(pOut!, pIn!, fixtures, horizon);

  if (asJson) { printJson(result); return; }

  console.log();
  const verdict = result.worth_it ? chalk.green("Worth it!") : chalk.red("Not worth the hit.");
  console.log(`  ${verdict}`);
  console.log(`  Net gain: ${chalk.yellow(`${result.net_gain >= 0 ? "+" : ""}${result.net_gain.toFixed(1)}`)} points`);
  console.log(`  ${result.reasoning}`);
  console.log();
}

export async function executeCommand(
  playerOut: string, playerIn: string, confirm: boolean, asJson: boolean,
  jsonInput?: string,
  planId?: string,
): Promise<void> {
  if (jsonInput) {
    const input = parseJsonInput(jsonInput, asJson);
    playerOut = input.out;
    playerIn = input.in;
    confirm = input.confirm ?? confirm;
    planId = input.plan_id ?? planId;
  }

  playerOut = sanitizePlayerName(playerOut, asJson);
  playerIn = sanitizePlayerName(playerIn, asJson);

  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const token = await auth.getAccessToken();
  if (!token) printError("Not logged in. Run: fpl login", asJson, "AUTH_REQUIRED");

  if (confirm && !planId) {
    printError("Plan ID required. Run the dry-run first and pass --plan-id <id>.", asJson, "INPUT_ERROR");
  }

  const pOut = await api.getPlayerByName(playerOut);
  const pIn = await api.getPlayerByName(playerIn);
  if (!pOut) printError(`Player not found: ${playerOut}`, asJson);
  if (!pIn) printError(`Player not found: ${playerIn}`, asJson);

  const gameweek = await api.getNextGameweek();
  const deadline = (await api.getNextDeadline()) ?? "";
  const squad = await api.getMySquad(teamId);

  let sellingPrice: number | undefined;
  for (const pick of squad.picks) {
    if (pick.element === pOut!.id) {
      sellingPrice = pick.selling_price;
      break;
    }
  }
  if (sellingPrice === undefined) {
    printError(`${pOut!.web_name} is not in your squad.`, asJson);
  }

  const transfer = {
    element_in: pIn!.id,
    element_out: pOut!.id,
    purchase_price: pIn!.now_cost,
    selling_price: sellingPrice!,
  };

  const armedChip = squad.chips.find((c) => c.status_for_entry === "active")?.name ?? null;
  const squadFingerprint = computeSquadFingerprint(squad.picks, squad.transfers.bank, armedChip, gameweek, deadline);
  const currentPlanId = computePlanId({
    action: "transfer",
    params: { element_out: pOut!.id, element_in: pIn!.id },
    gameweek,
    deadline,
    squadFingerprint,
  });

  if (!confirm) {
    const result = await api.makeTransfer({
      teamId, gameweek, transfers: [transfer], confirm: false,
    });

    const data = {
      mode: "dry_run",
      out: pOut!.web_name, in: pIn!.web_name,
      selling_price: sellingPrice! / 10,
      purchase_price: pIn!.now_cost / 10,
      validation: result,
      plan_id: currentPlanId,
      squad_fingerprint: squadFingerprint,
      deadline: deadline || null,
    };

    if (asJson) { printJson(data); return; }

    console.log();
    console.log(chalk.bold("  Transfer validated (dry run):"));
    console.log(`  OUT: ${pOut!.web_name} (£${(sellingPrice! / 10).toFixed(1)}m)`);
    console.log(`  IN:  ${pIn!.web_name} (£${(pIn!.now_cost / 10).toFixed(1)}m)`);
    console.log();
    console.log(chalk.dim(`  Plan ID: ${currentPlanId}`));
    console.log(chalk.dim(`  To confirm, re-run with --confirm --plan-id ${currentPlanId}`));
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

  const result = await api.makeTransfer({
    teamId, gameweek, transfers: [transfer], confirm: true,
  });

  const data = { mode: "confirmed", out: pOut!.web_name, in: pIn!.web_name, result, plan_id: currentPlanId };

  if (asJson) { printJson(data); return; }
  console.log(chalk.green("  Transfer confirmed!"));
  console.log();
}
