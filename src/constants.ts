/**
 * Shared constant maps used across command modules.
 * Position codes, availability status codes, and chip display names.
 */

/** FPL position codes → short labels. */
export const POS: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

/** FPL availability status codes → human labels. */
export const STATUS: Record<string, string> = {
  a: "Available",
  d: "Doubtful",
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
};

/** Chip identifiers → display names. */
export const CHIP_NAMES: Record<string, string> = {
  wildcard: "Wildcard",
  freehit: "Free Hit",
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
};
