/**
 * OAuth authentication for the FPL API via PingOne DaVinci flow.
 * Tokens stored in ~/.config/fpl-cli/tokens.json.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, unlinkSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { CONFIG_DIR, TOKEN_FILE } from "./config.js";

const AUTH_BASE = "https://account.premierleague.com";
const CLIENT_ID = "bfcbaf69-aade-4c1b-8f00-c1cb8a193030";
const REDIRECT_URI = "https://fantasy.premierleague.com/";
const SCOPES = "openid profile email";

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  [key: string]: unknown;
}

let cachedTokens: Tokens | null = null;

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const digest = createHash("sha256").update(verifier, "ascii").digest();
  const challenge = base64url(digest);
  return { verifier, challenge };
}

export function loadTokens(): Tokens | null {
  if (cachedTokens) return cachedTokens;
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    cachedTokens = JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    return cachedTokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: Tokens): void {
  cachedTokens = tokens;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  chmodSync(TOKEN_FILE, 0o600);
}

export function isTokenExpired(tokens: Tokens): boolean {
  return Date.now() / 1000 >= (tokens.expires_at - 60);
}

export function clearTokens(): void {
  cachedTokens = null;
  if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
}

interface DaVinciStep {
  id: string;
  connectionId: string;
  capabilityName: string;
  interactionId: string;
  [key: string]: unknown;
}

async function authorize(challenge: string): Promise<DaVinciStep> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    response_mode: "pi.flow",
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const resp = await fetch(`${AUTH_BASE}/as/authorize?${params}`);
  if (!resp.ok) throw new Error(`authorize failed: ${resp.status}`);
  return resp.json() as Promise<DaVinciStep>;
}

async function davinciPost(step: DaVinciStep, interactionId: string, payload: unknown): Promise<DaVinciStep> {
  const url = `${AUTH_BASE}/davinci/connections/${step.connectionId}/capabilities/${step.capabilityName}?interactionId=${interactionId}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`DaVinci step failed: ${resp.status}`);
  return resp.json() as Promise<DaVinciStep>;
}

async function skipProtect(step: DaVinciStep, interactionId: string): Promise<DaVinciStep> {
  return davinciPost(step, interactionId, {
    id: step.id,
    eventName: "continue",
    parameters: {
      eventType: "submit",
      data: { actionKey: "continue", formData: { protectsdk: "" } },
    },
  });
}

async function submitCredentials(
  step: DaVinciStep, interactionId: string, email: string, password: string,
): Promise<DaVinciStep> {
  const data = await davinciPost(step, interactionId, {
    id: step.id,
    eventName: "continue",
    interactionId,
    parameters: { buttonValue: "SIGNON", username: email, password },
  });
  if ("code" in data && typeof data.code === "string" && data.code.includes("nvalid")) {
    throw new Error(`Login failed: ${data.code}`);
  }
  return data;
}

async function continueInterstitial(step: DaVinciStep, interactionId: string): Promise<DaVinciStep> {
  return davinciPost(step, interactionId, {
    id: step.id,
    eventName: "continue",
    parameters: {
      eventType: "submit",
      data: { actionKey: "continue", formData: { buttonValue: "" } },
    },
  });
}

async function exchangeCode(code: string, verifier: string): Promise<Tokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });
  const resp = await fetch(`${AUTH_BASE}/as/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://fantasy.premierleague.com",
    },
    body,
  });
  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  return resp.json() as Promise<Tokens>;
}

async function refreshAccessToken(refreshToken: string): Promise<Tokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  });
  const resp = await fetch(`${AUTH_BASE}/as/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://fantasy.premierleague.com",
    },
    body,
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`);
  return resp.json() as Promise<Tokens>;
}

export async function login(email: string, password: string): Promise<void> {
  const { verifier, challenge } = generatePkce();

  const step1 = await authorize(challenge);
  let interactionId = step1.interactionId;

  const step2 = await skipProtect(step1, interactionId);
  const step3 = await submitCredentials(step2, interactionId, email, password);

  interactionId = (step3 as Record<string, unknown>).interactionId as string ?? interactionId;
  const step4 = await continueInterstitial(step3, interactionId);

  const authResponse = (step4 as Record<string, unknown>).authorizeResponse as Record<string, unknown> | undefined;
  const code = authResponse?.code as string | undefined;
  if (!code) {
    throw new Error(`No authorization code in response. Keys: ${Object.keys(step4).join(", ")}`);
  }

  const tokenData = await exchangeCode(code, verifier);
  tokenData.expires_at = Date.now() / 1000 + ((tokenData as Record<string, unknown>).expires_in as number ?? 28800);
  saveTokens(tokenData);
}

export async function getAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  if (!isTokenExpired(tokens)) return tokens.access_token;

  if (!tokens.refresh_token) return null;

  try {
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    newTokens.expires_at = Date.now() / 1000 + ((newTokens as Record<string, unknown>).expires_in as number ?? 28800);
    if (!newTokens.refresh_token) newTokens.refresh_token = tokens.refresh_token;
    saveTokens(newTokens);
    return newTokens.access_token;
  } catch {
    return null;
  }
}
