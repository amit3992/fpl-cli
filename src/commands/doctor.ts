import chalk from "chalk";
import * as config from "../config.js";
import * as auth from "../auth.js";
import * as api from "../api.js";
import { printJson } from "../output.js";

interface Check {
  check: string;
  ok: boolean;
  detail: string;
}

export async function doctorCommand(asJson: boolean): Promise<void> {
  const checks: Check[] = [];
  const cfg = config.load();

  checks.push({
    check: "Config file",
    ok: Object.keys(cfg).length > 0,
    detail: Object.keys(cfg).length > 0 ? config.CONFIG_FILE : "Not found. Run: fpl init",
  });

  const teamId = cfg.FPL_TEAM_ID ?? "";
  checks.push({ check: "Team ID", ok: !!teamId, detail: teamId || "Not set" });

  const hasCreds = !!(cfg.FPL_EMAIL && cfg.FPL_PASSWORD);
  checks.push({
    check: "FPL credentials",
    ok: hasCreds,
    detail: hasCreds ? "Configured" : "Not set (transfers disabled)",
  });

  const tokens = auth.loadTokens();
  const tokenOk = tokens !== null && !auth.isTokenExpired(tokens);
  checks.push({
    check: "Auth token",
    ok: tokenOk,
    detail: tokenOk ? "Valid" : tokens ? "Expired" : "None",
  });

  let apiOk = false;
  let apiDetail = "";
  try {
    await api.getBootstrap();
    apiOk = true;
    apiDetail = "Connected";
  } catch (e) {
    apiDetail = e instanceof Error ? e.message : String(e);
  }
  checks.push({ check: "FPL API", ok: apiOk, detail: apiDetail });

  if (asJson) { printJson(checks); return; }

  console.log();
  for (const c of checks) {
    const icon = c.ok ? chalk.green("OK") : chalk.red("FAIL");
    console.log(`  ${icon}  ${c.check}: ${c.detail}`);
  }
  console.log();
}
