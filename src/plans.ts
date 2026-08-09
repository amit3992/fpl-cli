/**
 * Approval-bound mutation plans.
 *
 * Pure module (no I/O, no network) — part of the testable core alongside
 * scoring.ts, fields.ts, and validate.ts. See AGENTS.md "Layering" and "Testing".
 *
 * Problem this solves: a human reviews a dry-run, then later runs --confirm.
 * Between those two moments the squad could change (price moves, a transfer
 * landing, captain changing, deadline passing). --confirm must prove it is
 * applying the exact state the human reviewed, not a stale or drifted one.
 *
 * How: every dry-run computes a plan_id — a hash of the intended action plus
 * a fingerprint of the live squad state at that moment. --confirm recomputes
 * the fingerprint from the *current* live state and must produce the same
 * plan_id, or the request is rejected as stale (see output.ts STALE_PLAN).
 */

import { createHash } from "node:crypto";

/**
 * Deterministically sorts object keys (recursively) so JSON.stringify output
 * is stable regardless of property insertion order. Arrays are canonicalized
 * element-wise but keep their given order — callers must pre-sort any array
 * whose order is not already part of the semantic identity of the plan
 * (e.g. computeSquadFingerprint sorts the squad by element id before this).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export interface PlanInput {
  /** e.g. "captain", "vice-captain", "chip_activate", "chip_deactivate", "transfer" */
  action: string;
  /** Action-specific identifying parameters, e.g. { player_id } or { element_out, element_in } */
  params: Record<string, unknown>;
  gameweek: number;
  /** ISO deadline string; empty string if unknown */
  deadline: string;
  squadFingerprint: string;
}

/**
 * plan_id = first 12 hex chars of sha256(canonical JSON of the plan input).
 * Deterministic: identical input always yields the identical id.
 */
export function computePlanId(input: PlanInput): string {
  const digest = createHash("sha256").update(stableStringify(input)).digest("hex");
  return digest.slice(0, 12);
}

export interface SquadFingerprintMember {
  element: number;
  selling_price?: number;
  is_captain?: boolean;
  is_vice_captain?: boolean;
}

/**
 * squad_fingerprint = first 16 hex chars of sha256(canonical JSON of squad +
 * bank + armed chip + gameweek + deadline). Sorted by element id so the
 * result does not depend on the API's pick ordering.
 */
export function computeSquadFingerprint(
  squad: SquadFingerprintMember[],
  bank: number,
  armedChip: string | null,
  gameweek: number,
  deadline: string,
): string {
  const sortedSquad = [...squad]
    .sort((a, b) => a.element - b.element)
    .map((m) => ({
      element: m.element,
      selling_price: m.selling_price ?? null,
      is_captain: m.is_captain ?? false,
      is_vice_captain: m.is_vice_captain ?? false,
    }));
  const payload = { squad: sortedSquad, bank, armedChip, gameweek, deadline };
  const digest = createHash("sha256").update(stableStringify(payload)).digest("hex");
  return digest.slice(0, 16);
}
