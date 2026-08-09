# fpl-cli

Command-line tool for Fantasy Premier League. Designed for both human and AI agent use.

## Install

### Homebrew (macOS/Linux)

```bash
brew tap amit3992/tap
brew install fpl-cli
```

### Development

```bash
git clone https://github.com/amit3992/fpl-cli.git
cd fpl-cli
npm install
npm run dev -- <command>
```

## Setup

```bash
# Interactive
fpl init

# Non-interactive (agent-friendly)
fpl init --team-id 123456 --email user@example.com --password secret
```

You'll be prompted for:
- **FPL Team ID** (required) — find it at `fantasy.premierleague.com/entry/XXXXXXX/`
- **FPL Email & Password** (optional) — only needed for executing transfers

Config is saved to `~/.config/fpl-cli/config.json`.

## Breaking Changes

- **`fpl news` (squad-wide) JSON** is now `{source, caveat?, players:[...]}` — was a bare array.
- **`fpl team --json`** returns a slim field set by default. Use `--full` for the previous complete set.
- **JSON output is minified** (single line, no indentation).

## Usage

```bash
# Show your live squad (next-GW state, reflects pending transfers/captain)
# Auth required for live state; falls back to current-GW picks if not logged in.
# JSON squad entries use a slim field set by default; add --full for form/ppg/total.
fpl team
fpl team --full

# Show a historical squad for a specific past GW
fpl team --gw 25

# One-call snapshot: squad + budget + chips + deadline + flagged players
fpl status

# Show budget, rank, chips
fpl budget

# Player stats
fpl player Salah

# Injury news for your squad (cap the list with --limit)
fpl news
fpl news --limit 3

# News for a specific player
fpl news Palmer

# Upcoming fixture difficulty
fpl fixtures Haaland

# Find replacements for a player
fpl transfers suggest Watkins

# Check if a hit is worth it
fpl transfers hit Watkins Isak

# Execute a transfer (dry run)
fpl transfers execute Watkins Isak

# Execute for real
fpl transfers execute Watkins Isak --confirm

# Set captain / vice-captain
fpl captain Salah
fpl vice-captain Palmer

# Activate a chip (dry-run; wildcard, freehit, bboost, 3xc)
fpl chip wildcard

# Confirm a chip activation
fpl chip wildcard --confirm

# Deactivate the currently armed chip (before deadline)
fpl chip none --confirm

# Check config & connectivity
fpl doctor
```

### Authentication

Transfers, captain changes, and chips require authentication:

```bash
fpl login    # authenticate with FPL (clears the stored password on success)
fpl logout   # clear stored tokens
```

A successful `fpl login` removes `FPL_PASSWORD` from `config.json` (OAuth tokens are used from then on); your email and team id are kept.

### JSON Output

All commands support `--json` for machine-parseable output. JSON is minified (single line):

```bash
fpl --json team
fpl --json status
fpl --json player Salah
fpl --json transfers suggest Watkins
```

### Field Filtering

Limit JSON output to specific fields with `--fields`:

```bash
fpl --json team --fields "name,position,price,form"
fpl --json player Salah --fields "name,price,form,ppg"
fpl --json budget --fields "bank,chips_available"
fpl --json status --fields "deadline,bank,flagged"
fpl --json news --fields "name,status" --limit 3
fpl --json transfers suggest Watkins --fields "name,price,score"
```

One-level dotted paths let you slim nested arrays/objects:

```bash
fpl --json status --fields "squad.name,squad.price,flagged.name"
fpl --json transfers suggest Watkins --fields "recommendations.name,recommendations.price"
```

### JSON Input

Transfer commands accept `--input-json` as an alternative to positional arguments:

```bash
fpl --json transfers hit --input-json '{"out":"Salah","in":"Palmer","horizon":5}'
fpl --json transfers execute --input-json '{"out":"Salah","in":"Palmer"}'
```

### AI Agent Usage

See [CONTEXT.md](CONTEXT.md) for agent-specific instructions, invariants, and workflow guides.

## License

MIT
