/**
 * Output formatting — human-readable or JSON.
 * All commands use these helpers so --json works consistently.
 */

import Table from "cli-table3";
import chalk from "chalk";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printError(message: string, asJson: boolean): never {
  if (asJson) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(chalk.red("Error:"), message);
  }
  process.exit(1);
}

export function makeTable(head: string[], colWidths?: number[]): Table.Table {
  const opts: Table.TableConstructorOptions = {
    head: head.map((h) => chalk.cyan.bold(h)),
    style: { head: [], border: [] },
  };
  if (colWidths) opts.colWidths = colWidths;
  return new Table(opts);
}
