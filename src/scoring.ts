/**
 * Player scoring and ranking logic.
 */

import type { Player, Fixture } from "./api.js";

function avgFdr(teamId: number, fixtures: Fixture[], n = 3): number {
  const teamFixtures: number[] = [];
  for (const f of fixtures) {
    if (f.team_h === teamId) teamFixtures.push(f.team_h_difficulty);
    else if (f.team_a === teamId) teamFixtures.push(f.team_a_difficulty);
  }
  if (teamFixtures.length === 0) return 3.0;
  const slice = teamFixtures.slice(0, n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function scorePlayer(player: Player, fixtures: Fixture[]): number {
  const form = parseFloat(player.form) || 0;
  const ppg = parseFloat(player.points_per_game) || 0;
  const fixtureScore = 5.0 - avgFdr(player.team, fixtures);
  return form * 0.3 + ppg * 0.4 + fixtureScore * 0.3;
}

export function rankPlayersByPosition(
  players: Player[],
  position: number,
  fixtures: Fixture[],
): (Player & { composite_score: number })[] {
  const filtered = players.filter((p) => p.element_type === position);
  const scored = filtered.map((p) => ({
    ...p,
    composite_score: scorePlayer(p, fixtures),
  }));
  return scored.sort((a, b) => b.composite_score - a.composite_score);
}

export function calculateHitValue(
  playerOut: Player,
  playerIn: Player,
  fixtures: Fixture[],
  horizon = 3,
): { worth_it: boolean; net_gain: number; reasoning: string } {
  const scoreOut = scorePlayer(playerOut, fixtures) * horizon;
  const scoreIn = scorePlayer(playerIn, fixtures) * horizon;
  const expectedGain = scoreIn - scoreOut;
  const netGain = expectedGain - 4;
  const worthIt = netGain > 2;

  const reasoning =
    `Projected points over ${horizon} GWs: ` +
    `${playerIn.web_name} = ${scoreIn.toFixed(1)}, ` +
    `${playerOut.web_name} = ${scoreOut.toFixed(1)}. ` +
    `Expected gain: ${expectedGain.toFixed(1)}, minus 4 hit = net ${netGain.toFixed(1)}. ` +
    `${worthIt ? "Worth it." : "Not worth the hit."}`;

  return { worth_it: worthIt, net_gain: Math.round(netGain * 100) / 100, reasoning };
}
