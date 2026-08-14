/**
 * Configuration management for fpl-cli.
 * Stores credentials in ~/.config/fpl-cli/config.json with restricted permissions.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { printError } from "./output.js";

export const CONFIG_DIR = join(homedir(), ".config", "fpl-cli");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const TOKEN_FILE = join(CONFIG_DIR, "tokens.json");

export interface Config {
  FPL_TEAM_ID?: string;
  FPL_EMAIL?: string;
  FPL_PASSWORD?: string;
}

export function load(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function save(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

export function get(key: keyof Config): string {
  return load()[key] ?? "";
}

const TEAM_ID_RE = /^\d{1,10}$/;

export function isValidTeamId(id: string): boolean {
  return TEAM_ID_RE.test(id);
}

/** Returns the configured team id or exits with INPUT_ERROR (exit 2). Never echoes the raw invalid value. */
export function getTeamId(asJson: boolean): string {
  const id = get("FPL_TEAM_ID");
  if (!id) printError("FPL Team ID not configured. Run: fpl init", asJson, "INPUT_ERROR");
  if (!isValidTeamId(id)) {
    printError("Stored FPL Team ID is invalid (must be 1-10 digits). Re-run: fpl init", asJson, "INPUT_ERROR");
  }
  return id;
}

/** Remove a key from the stored config (if present) and persist the change. */
export function unset(key: keyof Config): void {
  const config = load();
  if (!(key in config)) return;
  delete config[key];
  save(config);
}
