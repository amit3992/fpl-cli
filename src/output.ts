/**
 * Output formatting — human-readable or JSON.
 * All commands use these helpers so --json works consistently.
 */

import Table from "cli-table3";
import chalk from "chalk";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data));
}

/**
 * Stable error codes for --json consumers. Exit codes are a pure function of `code`:
 *   INPUT_ERROR (2)      — invalid input or missing config, e.g. `fpl init` not run
 *   STALE_PLAN (2)       — mutation plan_id no longer matches live squad state; re-dry-run
 *   AUTH_REQUIRED (3)    — not authenticated, run `fpl login`
 *   NETWORK_ERROR (4)    — retryable network failure
 *   TIMEOUT (4)          — retryable request timeout
 *   RATE_LIMITED (4)     — retryable, FPL API returned 429
 *   API_ERROR (5)        — permanent remote failure (FPL API returned a non-2xx status)
 *   UNEXPECTED_ERROR (1) — uncaught/internal error
 *
 * STALE_PLAN lives here (not in api.ts's ApiErrorCode) because it is a
 * command-level validation outcome computed from local plan/squad-state
 * comparison (see plans.ts) — it is never thrown from the HTTP layer the way
 * AUTH_REQUIRED/NETWORK_ERROR/RATE_LIMITED/API_ERROR are.
 */
export type ErrorCode =
  | "INPUT_ERROR"
  | "STALE_PLAN"
  | "AUTH_REQUIRED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "UNEXPECTED_ERROR";

const EXIT_CODES: Record<ErrorCode, number> = {
  INPUT_ERROR: 2,
  STALE_PLAN: 2,
  AUTH_REQUIRED: 3,
  NETWORK_ERROR: 4,
  TIMEOUT: 4,
  RATE_LIMITED: 4,
  API_ERROR: 5,
  UNEXPECTED_ERROR: 1,
};

export function printError(
  message: string,
  asJson: boolean,
  code: ErrorCode = "INPUT_ERROR",
  retryable = false,
): never {
  if (asJson) {
    console.log(JSON.stringify({ error: message, code, retryable }));
  } else {
    console.error(chalk.red("Error:"), message);
  }
  process.exit(EXIT_CODES[code]);
}

export function makeTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => chalk.cyan.bold(h)),
    style: { head: [], border: [] },
  };
  if (colWidths) opts.colWidths = colWidths;
  return new Table(opts);
}
