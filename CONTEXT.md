# fpl-cli — Agent Instructions

> Command-line tool for Fantasy Premier League. Designed for both human and AI agent use.

## Quick Reference

```
fpl --json team                              # your current GW squad
fpl --json team --next                       # your next GW squad
fpl --json budget                            # bank, rank, chips
fpl --json player <name>                     # player stats
fpl --json news                              # squad injury news
fpl --json news <name>                       # player-specific news
fpl --json fixtures <name>                   # fixture difficulty
fpl --json transfers suggest <name>          # replacement options
fpl --json transfers hit <out> <in>          # hit value calculation
fpl --json transfers execute <out> <in>      # dry-run transfer
fpl --json transfers execute <out> <in> --confirm  # confirm transfer
fpl --json captain <name>                    # set captain
fpl --json vice-captain <name>               # set vice-captain
fpl --json chip <name>                       # activate chip
fpl --json doctor                            # connectivity check
```

## Invariants

- **ALWAYS use `--json`** for machine-readable output. Human-formatted output contains ANSI escape codes and table borders that waste context.
- **ALWAYS use `--fields`** to limit output to the fields you need. Example: `fpl --json player Salah --fields "name,form,ppg,price"`.
- **NEVER run `transfers execute --confirm` without first running a dry-run** (without `--confirm`) and inspecting the validation result.
- **NEVER skip the dry-run step.** The FPL API does not support undoing transfers.
- Authentication is required for `transfers execute`, `captain`, `vice-captain`, `chip`, and `team --next`. Read-only commands (`team`, `player`, `news`, `fixtures`, `transfers suggest`, `transfers hit`) work without login.

## Non-Interactive Setup

Use flags instead of interactive prompts:

```
fpl init --team-id 123456
fpl init --team-id 123456 --email user@example.com --password secret
```

## JSON Input

Transfer commands accept `--input-json` as an alternative to positional arguments:

```
fpl --json transfers hit --input-json '{"out":"Salah","in":"Palmer","horizon":5}'
fpl --json transfers execute --input-json '{"out":"Salah","in":"Palmer"}'
fpl --json transfers execute --input-json '{"out":"Salah","in":"Palmer","confirm":true}'
```

## Field Filtering

Reduce output size with `--fields` (comma-separated):

```
fpl --json team --fields "name,position,price,form"
fpl --json player Salah --fields "name,price,form,ppg,upcoming_fixtures"
fpl --json budget --fields "bank,chips_available"
```

## Error Format

All errors are returned as JSON when `--json` is set:

```json
{"error": "Player not found: Salaah"}
```

Exit code is always 1 on error.

## Workflow: Making a Transfer

1. Check your team: `fpl --json team --fields "name,position,price,form,status"`
2. Find replacements: `fpl --json transfers suggest Watkins`
3. Check if hit is worth it: `fpl --json transfers hit Watkins Isak`
4. Dry-run the transfer: `fpl --json transfers execute Watkins Isak`
5. Inspect the dry-run result — check for errors
6. Confirm: `fpl --json transfers execute Watkins Isak --confirm`
7. Verify: `fpl --json team --next` to confirm the change

## Workflow: Gameweek Prep

Use `/fpl-gameweek` to run a full gameweek review — it checks injuries, analyzes fixtures, suggests transfers, and recommends captain picks.

## Input Constraints

- Player names: max 100 characters, no control characters, no `?`, `#`, `%`, or `..`
- Team IDs: numeric strings only
- All string inputs are trimmed of whitespace
