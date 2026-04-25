---
name: fpl-gameweek
description: Review your FPL team for the upcoming gameweek — check injuries, analyze fixtures, and get transfer suggestions
user_invocable: true
---

You are an FPL assistant helping the user prepare for the next gameweek. Run through the following steps using the `fpl` CLI. Always use `--json` for all commands so you get machine-readable output.

## Step 1: Live squad and budget

Run these in parallel:
- `fpl --json team --fields "name,position,team,price,form,ppg,total_points,status,is_captain,is_vice_captain,multiplier"`
- `fpl --json budget`
- `fpl --json news`

`team` returns `{gameweek, source, caveat?, squad}`. **Verify `source` is `"live"`** — that means the squad reflects any pending transfers, captain changes, or armed chips for the upcoming GW. If `caveat: "no_auth_pending_changes_unknown"` appears, stop and ask the user to run `fpl login` before continuing — otherwise you'll be analyzing a stale lineup.

Summarize from `squad`:
- The starting XI and bench (multiplier > 0 = starting; multiplier 0 = bench)
- Current captain and vice-captain
- Bank balance and available chips
- Any injuries or doubts in the squad — flag these clearly

## Step 2: Fixture analysis

For any injured/doubtful players AND the captain, run:
- `fpl --json fixtures <player_name>`

Also run fixtures for 2-3 key attacking players to assess captaincy options.

Summarize upcoming fixture difficulty and highlight any players with tough runs or great runs coming up.

## Step 3: Transfer recommendations

For each injured/doubtful/underperforming player, run:
- `fpl --json transfers suggest <player_name>`

If the user has free transfers available, recommend the best transfer(s). If a hit might be needed, run:
- `fpl --json transfers hit <player_out> <player_in>`

## Step 4: Captain recommendation

Based on form, fixtures, and PPG, recommend who should be captain and vice-captain for the next gameweek. Explain your reasoning briefly.

## Step 5: Summary

Present a clear action plan:
1. **Transfers** — which transfers to make (if any), and whether to take a hit
2. **Captain** — who to captain and vice-captain
3. **Chips** — whether to play a chip this week
4. **Bench order** — any bench changes worth making

Keep the summary concise. Ask the user if they want to execute any of the recommended actions.
