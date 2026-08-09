/**
 * Configuration management for fpl-cli.
 * Stores credentials in ~/.config/fpl-cli/config.json with restricted permissions.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
}

export function get(key: keyof Config): string {
  return load()[key] ?? "";
}

/** Remove a key from the stored config (if present) and persist the change. */
export function unset(key: keyof Config): void {
  const config = load();
  if (!(key in config)) return;
  delete config[key];
  save(config);
}
