/**
 * FPL API client.
 */

import { getAccessToken } from "./auth.js";

const BASE_URL = "https://fantasy.premierleague.com/api";

let bootstrapCache: Bootstrap | null = null;

// --- Types ---

export interface Player {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  form: string;
  points_per_game: string;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  ict_index: string;
  expected_goals: string;
  expected_assists: string;
  selected_by_percent: string;
  status: string;
  news: string;
  news_added: string;
  chance_of_playing_next_round: number | null;
}

export interface Team {
  id: number;
  name: string;
}

export interface Event {
  id: number;
  is_current: boolean;
  is_next: boolean;
  deadline_time: string;
}

export interface Bootstrap {
  elements: Player[];
  teams: Team[];
  events: Event[];
  element_types: { id: number; singular_name_short: string }[];
}

export interface Pick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  selling_price?: number;
}

export interface PicksData {
  picks: Pick[];
  entry_history: {
    bank: number;
    value: number;
    event_transfers: number;
  };
}

export interface Fixture {
  id: number;
  event: number;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  finished: boolean;
}

export interface PlayerFixture {
  event: number;
  team_h: number;
  team_a: number;
  is_home: boolean;
  difficulty: number;
}

export interface PlayerHistory {
  round: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
}

export interface PlayerSummary {
  history: PlayerHistory[];
  fixtures: PlayerFixture[];
}

export interface Entry {
  name: string;
  summary_overall_rank: number;
  summary_overall_points: number;
  chips: { name: string }[];
}

// --- Fetchers ---

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`);
  if (!resp.ok) throw new Error(`FPL API ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<T>;
}

async function authGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}${path}`, { headers });
  if (!resp.ok) throw new Error(`FPL API ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json() as Promise<T>;
}

async function authPost<T>(path: string, payload: unknown): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://fantasy.premierleague.com/",
    "Origin": "https://fantasy.premierleague.com",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    let detail = "";
    try { detail = " — " + await resp.text(); } catch { /* ignore */ }
    throw new Error(`FPL API POST ${path}: ${resp.status} ${resp.statusText}${detail}`);
  }
  const text = await resp.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// --- Public API ---

export async function getBootstrap(): Promise<Bootstrap> {
  if (bootstrapCache) return bootstrapCache;
  bootstrapCache = await get<Bootstrap>("/bootstrap-static/");
  return bootstrapCache;
}

export async function getCurrentGameweek(): Promise<number> {
  const data = await getBootstrap();
  for (const event of data.events) {
    if (event.is_current) return event.id;
  }
  for (const event of data.events) {
    if (event.is_next) return event.id;
  }
  return 1;
}

export async function getNextGameweek(): Promise<number> {
  const data = await getBootstrap();
  for (const event of data.events) {
    if (event.is_next) return event.id;
  }
  // If no "next" (e.g., mid-gameweek), current + 1
  for (const event of data.events) {
    if (event.is_current) return event.id + 1;
  }
  return 1;
}

export async function getNextDeadline(): Promise<string | null> {
  const data = await getBootstrap();
  const gw = await getNextGameweek();
  return data.events.find((e) => e.id === gw)?.deadline_time ?? null;
}

export async function getMyTeam(teamId: string, gameweek?: number): Promise<PicksData> {
  const gw = gameweek ?? await getCurrentGameweek();
  return get<PicksData>(`/entry/${teamId}/event/${gw}/picks/`);
}

export async function getEntry(teamId: string): Promise<Entry> {
  return get<Entry>(`/entry/${teamId}/`);
}

export async function getPlayerByName(name: string): Promise<Player | null> {
  const data = await getBootstrap();
  const lower = name.toLowerCase();

  // Exact match
  for (const p of data.elements) {
    const webName = p.web_name.toLowerCase();
    const fullName = `${p.first_name} ${p.second_name}`.toLowerCase();
    if (lower === webName || lower === fullName) return p;
  }

  // Substring match
  const candidates: Player[] = [];
  for (const p of data.elements) {
    const webName = p.web_name.toLowerCase();
    const fullName = `${p.first_name} ${p.second_name}`.toLowerCase();
    if (webName.includes(lower) || fullName.includes(lower)) {
      candidates.push(p);
    }
  }
  if (candidates.length > 0) {
    return candidates.reduce((a, b) => a.web_name.length <= b.web_name.length ? a : b);
  }

  // Fuzzy fallback — simple Dice coefficient
  let bestMatch: Player | null = null;
  let bestScore = 0;
  for (const p of data.elements) {
    for (const field of [p.web_name, `${p.first_name} ${p.second_name}`]) {
      const score = diceCoefficient(lower, field.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }
  }
  return bestScore >= 0.5 ? bestMatch : null;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bi = a.slice(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) ?? 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bi = b.slice(i, i + 2);
    const count = bigrams.get(bi) ?? 0;
    if (count > 0) {
      bigrams.set(bi, count - 1);
      matches++;
    }
  }
  return (2 * matches) / (a.length + b.length - 2);
}

export async function getFixtures(): Promise<Fixture[]> {
  const fixtures = await get<Fixture[]>("/fixtures/");
  return fixtures.filter((f) => !f.finished);
}

export async function getPlayerSummary(playerId: number): Promise<PlayerSummary> {
  return get<PlayerSummary>(`/element-summary/${playerId}/`);
}

export interface MyTeamData {
  picks: Pick[];
  chips: { status_for_entry: string; name: string }[];
  transfers: {
    bank: number;
    limit: number | null;
    made: number;
    status: string;
  };
}

export async function getMySquad(teamId: string): Promise<MyTeamData> {
  return authGet<MyTeamData>(`/my-team/${teamId}/`);
}

export interface LiveSquadState {
  picks: Pick[];
  bank: number;
  team_value: number;
  source: "live" | "historical";
  caveat: string | null;
  gameweek: number;
  chips: { name: string; status: string }[];
}

export async function getLiveSquadState(teamId: string): Promise<LiveSquadState> {
  const token = await getAccessToken();
  if (token) {
    const myTeam = await getMySquad(teamId);
    const gameweek = await getNextGameweek();
    const teamValue = myTeam.picks.reduce((sum, p) => sum + (p.selling_price ?? 0), 0);
    return {
      picks: myTeam.picks,
      bank: myTeam.transfers.bank,
      team_value: teamValue,
      source: "live",
      caveat: null,
      gameweek,
      chips: myTeam.chips.map((c) => ({ name: c.name, status: c.status_for_entry })),
    };
  }
  const gameweek = await getCurrentGameweek();
  const picksData = await getMyTeam(teamId, gameweek);
  return {
    picks: picksData.picks,
    bank: picksData.entry_history.bank,
    team_value: picksData.entry_history.value,
    source: "historical",
    caveat: "no_auth_pending_changes_unknown",
    gameweek,
    chips: [],
  };
}

export async function updateMyTeam(teamId: string, picks: Pick[], chip?: string | null): Promise<unknown> {
  return authPost(`/my-team/${teamId}/`, {
    chip: chip ?? null,
    picks: picks.map((p) => ({
      element: p.element,
      position: p.position,
      is_captain: p.is_captain,
      is_vice_captain: p.is_vice_captain,
    })),
  });
}

export async function makeTransfer(opts: {
  teamId: string;
  gameweek: number;
  transfers: { element_in: number; element_out: number; purchase_price: number; selling_price: number }[];
  confirm: boolean;
  wildcard?: boolean;
  freehit?: boolean;
}): Promise<unknown> {
  return authPost("/transfers/", {
    confirmed: opts.confirm,
    entry: parseInt(opts.teamId, 10),
    event: opts.gameweek,
    transfers: opts.transfers,
    wildcard: opts.wildcard ?? false,
    freehit: opts.freehit ?? false,
  });
}
