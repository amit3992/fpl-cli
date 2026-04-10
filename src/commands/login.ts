import chalk from "chalk";
import * as config from "../config.js";
import * as auth from "../auth.js";
import { printJson, printError } from "../output.js";

export async function loginCommand(asJson: boolean): Promise<void> {
  const cfg = config.load();
  const email = cfg.FPL_EMAIL;
  const password = cfg.FPL_PASSWORD;

  if (!email || !password) {
    printError("FPL_EMAIL and FPL_PASSWORD not configured. Run: fpl init", asJson);
  }

  const token = await auth.getAccessToken();
  if (token) {
    if (asJson) printJson({ status: "already_authenticated" });
    else console.log(chalk.green("Already authenticated (token valid)."));
    return;
  }

  try {
    await auth.login(email, password);
    if (asJson) printJson({ status: "authenticated" });
    else console.log(chalk.green("Logged in successfully. Tokens saved."));
  } catch (e) {
    printError(`Login failed: ${e instanceof Error ? e.message : e}`, asJson);
  }
}

export function logoutCommand(asJson: boolean): void {
  auth.clearTokens();
  if (asJson) printJson({ status: "logged_out" });
  else console.log(chalk.green("Tokens cleared."));
}
