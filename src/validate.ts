/**
 * Input validation — sanitize and reject suspicious inputs.
 * Treats all input as untrusted (agent-safe).
 */

import { printError } from "./output.js";

const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const SUSPICIOUS_PATTERNS = /[?#%]|\.{2,}/;

export function sanitizePlayerName(name: string, asJson: boolean): string {
  if (!name || name.trim().length === 0) {
    printError("Player name cannot be empty.", asJson);
  }

  if (CONTROL_CHARS.test(name)) {
    printError("Player name contains invalid control characters.", asJson);
  }

  if (SUSPICIOUS_PATTERNS.test(name)) {
    printError("Player name contains invalid characters (?, #, %, or path traversal).", asJson);
  }

  const sanitized = name.trim();

  if (sanitized.length > 100) {
    printError("Player name too long (max 100 characters).", asJson);
  }

  return sanitized;
}

export function sanitizeString(value: string, fieldName: string, asJson: boolean): string {
  if (CONTROL_CHARS.test(value)) {
    printError(`${fieldName} contains invalid control characters.`, asJson);
  }
  return value.trim();
}
