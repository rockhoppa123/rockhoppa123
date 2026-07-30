# Mascot pulse — design

Wire the profile mascot's existing CSS animation to real recent GitHub commit
activity, so the profile is subtly alive instead of static — a small,
self-referential dogfood of Mascot Forge's own "animation state bound to live
data" pitch, without needing mascot-forge as a runtime dependency.

## Why

Profile README already ships a Mascot Forge-generated SVG (`mascot.svg`) with
a pure CSS breathe + blink loop, no JS, no runtime. It's a static rig today.
Tying its animation speed to actual commit frequency turns it into a small
honest signal of "is this person active" rather than decoration, and ties the
profile directly to the one product that's actually shipped.

## Architecture

```
cron (daily, 06:00 UTC) ──▶ .github/workflows/mascot-pulse.yml
                              └─▶ node scripts/update-mascot.mjs
                                    1. GET api.github.com/users/rockhoppa123/events/public
                                    2. count commits (PushEvent) in last 48h
                                    3. map count → tier → {breathe-ms, blink-ms}
                                    4. regex-replace those two durations in mascot.svg's <style>
                              └─▶ commit mascot.svg if changed, push
```

No mascot-forge CLI/MCP invocation at schedule time — mascot.svg is small,
hand-editable text, and only two numeric values ever change. Keeps the Action
dependency-free (matches mascot-forge's own "no black box runtime" stance,
applied to itself).

## Components

- **`scripts/update-mascot.mjs`** — plain Node (20+, global `fetch`), zero
  npm deps. Reads `mascot.svg` as text, replaces the two `animation` duration
  values via regex, writes back only if a value changed. Supports
  `--dry-run` (prints computed tier + values, does not write) for local
  testing.
- **`.github/workflows/mascot-pulse.yml`** — triggers: `schedule` (daily
  cron) and `workflow_dispatch` (manual re-run). Uses default
  `GITHUB_TOKEN` for the events API call (raises rate limit off the
  unauthenticated 60/hr; no special scopes needed since it's public data).
  Commits only if `git status --short` shows a diff; otherwise no-op.

## Data flow / tiers

Source: `GET /users/rockhoppa123/events/public`, sum of commits across
`PushEvent` entries with `created_at` within the last 48h.

| commits (48h) | tier   | breathe | blink  |
|---------------|--------|---------|--------|
| 0              | quiet  | 2400ms  | 5200ms |
| 1–3            | normal | 1800ms  | 4200ms |
| 4+             | busy   | 1200ms  | 3200ms |

`normal` matches today's shipped values, so a typical day looks unchanged.

## Error handling

API call fails or is rate-limited → script logs a warning and exits 0
without writing. Last committed state is left as-is. A bad day never breaks
the rendered profile — worst case the animation speed is one day stale.

## Testing

- `node scripts/update-mascot.mjs --dry-run` — runnable locally, prints the
  computed tier and durations without touching the file. The one required
  self-check per ponytail: smallest thing that fails if the tier logic or
  regex replacement breaks.
- After deploy: trigger `workflow_dispatch` once manually, confirm the
  commit diff is exactly the two duration values, and view the rendered
  profile to confirm the mascot still animates.

## Out of scope

- No new visual states/rigs, no re-invoking mascot-forge's emitter, no
  auth-token-gated GraphQL contribution calendar, no cross-repo
  `repository_dispatch` triggers. All deferred per the brainstorming
  conversation — daily cron + speed-tweak only, upgrade path if wanted later.
