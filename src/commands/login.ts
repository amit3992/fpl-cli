import chalk from "chalk";
import * as config from "../config.js";
import * as auth from "../auth.js";
import { printJson, printError } from "../output.js";

export async function loginCommand(asJson: boolean): Promise<void> {
  const cfg = config.load();
  const email = process.env.FPL_EMAIL || cfg.FPL_EMAIL;
  const password = process.env.FPL_PASSWORD || cfg.FPL_PASSWORD;

  if (!email || !password) {
    printError("FPL credentials not found. Set FPL_EMAIL/FPL_PASSWORD env vars or run: fpl init", asJson);
  }

  const token = await auth.getAccessToken();
  if (token) {
    if (asJson) printJson({ status: "already_authenticated" });
    else console.log(chalk.green("Already authenticated (token valid)."));
    return;
  }

  try {
    await auth.login(email, password);
    // OAuth tokens are what's actually used from here on; drop the plaintext
    // password from config.json now that login succeeded. Email + team id stay.
    config.unset("FPL_PASSWORD");
    if (asJson) printJson({ status: "authenticated", password_cleared: true });
    else console.log(chalk.green("Logged in successfully. Tokens saved. Stored password cleared."));
  } catch (e) {
    printError(`Login failed: ${e instanceof Error ? e.message : e}`, asJson);
  }
}

export function logoutCommand(asJson: boolean): void {
  auth.clearTokens();
  if (asJson) printJson({ status: "logged_out" });
  else console.log(chalk.green("Tokens cleared."));
}
