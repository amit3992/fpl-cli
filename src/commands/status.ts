import chalk from "chalk";
import * as api from "../api.js";
import * as config from "../config.js";
import { printJson, printError } from "../output.js";
import { filterFields } from "../fields.js";
import { POS, STATUS } from "../constants.js";

/**
 * `fpl status` — a single aggregated snapshot for agents: squad, budget, chips,
 * next deadline, and any flagged (non-available) players in one call. Reuses the
 * same live-vs-historical squad state and caveat contract as `team`/`budget`.
 */
export async function statusCommand(asJson: boolean, fields?: string): Promise<void> {
  const teamId = config.get("FPL_TEAM_ID");
  if (!teamId) printError("FPL Team ID not configured. Run: fpl init", asJson);

  const bootstrap = await api.getBootstrap();
  const elements = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.name]));

  const entry = await api.getEntry(teamId);
  const state = await api.getLiveSquadState(teamId);
  const deadline = await api.getNextDeadline();

  let chipsAvailable: string[];
  let chipsActive: string[];
  if (state.source === "live") {
    chipsAvailable = state.chips.filter((c) => c.status === "available").map((c) => c.name);
    chipsActive = state.chips.filter((c) => c.status === "active").map((c) => c.name);
  } else {
    const allChips = ["wildcard", "freehit", "bboost", "3xc"];
    const played = (entry.chips ?? []).map((c) => c.name);
    chipsAvailable = allChips.filter((c) => !played.includes(c));
    chipsActive = [];
  }

  const squad = state.picks.map((pick) => {
    const p = elements.get(pick.element)!;
    return {
      name: p.web_name,
      position: POS[p.element_type] ?? "???",
      team: teams.get(p.team) ?? "???",
      price: p.now_cost / 10,
      status: STATUS[p.status] ?? p.status,
      is_captain: pick.is_captain,
      is_vice_captain: pick.is_vice_captain,
      multiplier: pick.multiplier,
    };
  });

  const flagged = state.picks
    .map((pick) => elements.get(pick.element)!)
    .filter((p) => p.status !== "a")
    .map((p) => ({
      name: p.web_name,
      status: STATUS[p.status] ?? p.status,
      news: p.news ?? "",
      chance_next_round: p.chance_of_playing_next_round,
    }));

  const data: Record<string, unknown> = {
    gameweek: state.gameweek,
    deadline: deadline ?? null,
    team_name: entry.name ?? "Unknown",
    bank: state.bank / 10,
    total_value: state.team_value / 10,
    overall_rank: entry.summary_overall_rank,
    total_points: entry.summary_overall_points,
    chips_available: chipsAvailable,
    chips_active: chipsActive,
    source: state.source,
    caveat: state.caveat ?? undefined,
    squad,
    flagged,
  };

  if (asJson) { printJson(filterFields(data, fields)); return; }

  const rankStr = entry.summary_overall_rank != null ? entry.summary_overall_rank.toLocaleString() : "—";
  const pointsStr = entry.summary_overall_points != null ? String(entry.summary_overall_points) : "—";

  console.log();
  console.log(`  ${chalk.bold(data.team_name as string)} — GW ${state.gameweek}`);
  if (deadline) console.log(chalk.dim(`  Deadline: ${deadline}`));
  console.log(`  Bank: ${chalk.green(`£${(state.bank / 10).toFixed(1)}m`)}   Value: ${chalk.green(`£${(state.team_value / 10).toFixed(1)}m`)}`);
  console.log(`  Overall rank: ${chalk.yellow(rankStr)}   Total points: ${chalk.yellow(pointsStr)}`);
  console.log(`  Chips left: ${chipsAvailable.join(", ") || "none"}`);
  if (chipsActive.length > 0) console.log(`  Chip armed: ${chalk.cyan(chipsActive.join(", "))}`);
  if (state.source !== "live") console.log(chalk.dim(`  ${chalk.yellow("(not logged in — pending changes not shown)")}`));

  console.log();
  if (flagged.length === 0) {
    console.log(`  ${chalk.green("No injury/availability flags.")}`);
  } else {
    console.log(chalk.bold(`  Flagged (${flagged.length}):`));
    for (const f of flagged) {
      const chance = f.chance_next_round !== null ? `${f.chance_next_round}%` : "?";
      console.log(`  ${chalk.red(f.name)} — ${f.status} (${chance})${f.news ? ` — ${f.news}` : ""}`);
    }
  }
  console.log();
}
