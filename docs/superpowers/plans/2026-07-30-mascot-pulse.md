# Mascot Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the profile mascot's existing CSS breathe/blink animation speed to recent GitHub commit activity via a daily-cron Action, with no runtime dependency on mascot-forge.

**Architecture:** A single zero-dependency Node script (`scripts/update-mascot.mjs`) computes an activity tier from the GitHub public events API and regex-replaces two animation-duration values in `mascot.svg`. A GitHub Actions workflow runs it daily and on manual dispatch, committing `mascot.svg` only if it changed.

**Tech Stack:** Node 20+ (global `fetch`, `node:test`), GitHub Actions, no npm packages.

## Global Constraints

- Node 20+ only, zero npm dependencies (per spec: matches mascot-forge's own no-black-box-runtime stance).
- All logic lives in `scripts/update-mascot.mjs` — one file, per spec's "small, hand-editable" design.
- Only `mascot.svg`'s two `animation:` duration values (`mf-breathe`, `mf-blink`) are ever modified — no other SVG content changes.
- Tiers (spec table, exact values):
  | commits (48h) | tier   | breathe | blink  |
  |---------------|--------|---------|--------|
  | 0              | quiet  | 2400ms  | 5200ms |
  | 1–3            | normal | 1800ms  | 4200ms |
  | 4+             | busy   | 1200ms  | 3200ms |
- API failure or rate limit → log a warning, exit 0, leave `mascot.svg` untouched (never break the profile).
- Commit to `mascot.svg` only if the regenerated text differs from what's on disk.
- Do not push to `origin` without explicit user confirmation first (per session's action-permission rules).

---

### Task 1: Core scoring and text-patching functions (TDD)

**Files:**
- Create: `scripts/update-mascot.mjs`
- Create: `tests/update-mascot.test.mjs`

**Interfaces:**
- Produces: `computeTier(commitCount: number): { tier: 'quiet'|'normal'|'busy', breatheMs: number, blinkMs: number }`
- Produces: `countRecentPushCommits(events: Array<{type: string, created_at: string, payload?: {commits?: unknown[]}}>, nowMs?: number, windowMs?: number): number`
- Produces: `updateSvgDurations(svgText: string, breatheMs: number, blinkMs: number): string`

These three are pure, importable, and exercised directly by Task 1's tests. Task 2 imports all three from this file.

- [ ] **Step 1: Write the failing tests**

Create `tests/update-mascot.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTier, countRecentPushCommits, updateSvgDurations } from '../scripts/update-mascot.mjs';

test('computeTier: 0 commits is quiet', () => {
  assert.deepEqual(computeTier(0), { tier: 'quiet', breatheMs: 2400, blinkMs: 5200 });
});

test('computeTier: 1-3 commits is normal', () => {
  assert.deepEqual(computeTier(1), { tier: 'normal', breatheMs: 1800, blinkMs: 4200 });
  assert.deepEqual(computeTier(3), { tier: 'normal', breatheMs: 1800, blinkMs: 4200 });
});

test('computeTier: 4+ commits is busy', () => {
  assert.deepEqual(computeTier(4), { tier: 'busy', breatheMs: 1200, blinkMs: 3200 });
  assert.deepEqual(computeTier(10), { tier: 'busy', breatheMs: 1200, blinkMs: 3200 });
});

test('countRecentPushCommits: sums commits within window, ignores old and non-push events', () => {
  const now = Date.parse('2026-07-30T12:00:00Z');
  const events = [
    { type: 'PushEvent', created_at: '2026-07-30T10:00:00Z', payload: { commits: [{}, {}] } }, // 2h ago, 2 commits
    { type: 'PushEvent', created_at: '2026-07-27T10:00:00Z', payload: { commits: [{}] } }, // 74h ago, out of window
    { type: 'WatchEvent', created_at: '2026-07-30T11:00:00Z', payload: {} }, // wrong type
  ];
  assert.equal(countRecentPushCommits(events, now), 2);
});

test('countRecentPushCommits: missing payload.commits counts as zero', () => {
  const now = Date.parse('2026-07-30T12:00:00Z');
  const events = [{ type: 'PushEvent', created_at: '2026-07-30T11:00:00Z', payload: {} }];
  assert.equal(countRecentPushCommits(events, now), 0);
});

test('updateSvgDurations: replaces breathe and blink durations only', () => {
  const svg = '<style>.a{animation: mf-breathe 1800ms ease-in-out infinite;} .b{animation: mf-blink 4200ms step-end infinite;}</style>';
  const updated = updateSvgDurations(svg, 1200, 3200);
  assert.equal(
    updated,
    '<style>.a{animation: mf-breathe 1200ms ease-in-out infinite;} .b{animation: mf-blink 3200ms step-end infinite;}</style>'
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../scripts/update-mascot.mjs'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `scripts/update-mascot.mjs`:

```js
export function computeTier(commitCount) {
  if (commitCount >= 4) return { tier: 'busy', breatheMs: 1200, blinkMs: 3200 };
  if (commitCount >= 1) return { tier: 'normal', breatheMs: 1800, blinkMs: 4200 };
  return { tier: 'quiet', breatheMs: 2400, blinkMs: 5200 };
}

export function countRecentPushCommits(events, nowMs = Date.now(), windowMs = 48 * 60 * 60 * 1000) {
  let total = 0;
  for (const event of events) {
    if (event.type !== 'PushEvent') continue;
    const createdMs = new Date(event.created_at).getTime();
    if (nowMs - createdMs > windowMs) continue;
    total += event.payload?.commits?.length ?? 0;
  }
  return total;
}

export function updateSvgDurations(svgText, breatheMs, blinkMs) {
  return svgText
    .replace(/mf-breathe \d+ms/, `mf-breathe ${breatheMs}ms`)
    .replace(/mf-blink \d+ms/, `mf-blink ${blinkMs}ms`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/update-mascot.mjs tests/update-mascot.test.mjs
git commit -m "Add mascot-pulse scoring and SVG-patching functions"
```

---

### Task 2: CLI wiring — fetch, dry-run, file write

**Files:**
- Modify: `scripts/update-mascot.mjs` (append to the file created in Task 1)

**Interfaces:**
- Consumes: `computeTier`, `countRecentPushCommits`, `updateSvgDurations` from Task 1 (same file, no import needed).
- Produces: a runnable CLI — `node scripts/update-mascot.mjs` (live) and `node scripts/update-mascot.mjs --dry-run` (no writes) — used directly by Task 3's workflow step.

No new automated test here: the added code is I/O orchestration (network fetch, file write) with no pure logic left to unit test — Task 1 already covers every branching rule. Verified manually in Step 3 below, per plan's testing approach.

- [ ] **Step 1: Append the CLI/fetch/main logic**

Add to the bottom of `scripts/update-mascot.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const USERNAME = 'andrewlawsonza';
const SVG_PATH = new URL('../mascot.svg', import.meta.url);

async function fetchRecentEvents(username, token) {
  const headers = { 'User-Agent': 'mascot-pulse-script' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/users/${username}/events/public`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let tierInfo;
  try {
    const events = await fetchRecentEvents(USERNAME, process.env.GITHUB_TOKEN);
    const commitCount = countRecentPushCommits(events);
    tierInfo = computeTier(commitCount);
    console.log(
      `commits(48h)=${commitCount} tier=${tierInfo.tier} breathe=${tierInfo.breatheMs}ms blink=${tierInfo.blinkMs}ms`
    );
  } catch (err) {
    console.warn(`mascot-pulse: fetch failed, leaving mascot.svg unchanged (${err.message})`);
    return;
  }
  if (dryRun) return;
  const original = readFileSync(SVG_PATH, 'utf8');
  const updated = updateSvgDurations(original, tierInfo.breatheMs, tierInfo.blinkMs);
  if (updated !== original) {
    writeFileSync(SVG_PATH, updated);
    console.log('mascot.svg updated');
  } else {
    console.log('mascot.svg unchanged');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
```

Note: `readFileSync`/`writeFileSync`/`pathToFileURL` imports go at the top of the file alongside this addition — combine with the existing file rather than duplicating an import block.

- [ ] **Step 2: Run the existing unit tests to confirm nothing broke**

Run: `node --test tests/`
Expected: PASS — still 6 tests, 0 failures (new code isn't imported by the test file, only exercised via CLI).

- [ ] **Step 3: Manually verify dry-run against the real API**

Run: `node scripts/update-mascot.mjs --dry-run`
Expected output (values vary with actual recent activity):
```
commits(48h)=<N> tier=<quiet|normal|busy> breathe=<...>ms blink=<...>ms
```
Confirm `mascot.svg` is untouched: `git status --short` shows no changes.

- [ ] **Step 4: Manually verify a live (non-dry-run) run updates the file correctly**

Run: `node scripts/update-mascot.mjs`
Then: `git diff mascot.svg`
Expected: diff touches only the `mf-breathe ...ms` and `mf-blink ...ms` values (or no diff at all if today's tier matches what's already committed — that's correct behavior, not a bug).
Revert the working-tree change before committing (Task 2 ships code, not a data update): `git checkout -- mascot.svg`

- [ ] **Step 5: Commit**

```bash
git add scripts/update-mascot.mjs
git commit -m "Add fetch/CLI wiring to mascot-pulse script"
```

---

### Task 3: GitHub Actions workflow + end-to-end verification

**Files:**
- Create: `.github/workflows/mascot-pulse.yml`

**Interfaces:**
- Consumes: `scripts/update-mascot.mjs` (Task 2's CLI), `tests/update-mascot.test.mjs` (Task 1).

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/mascot-pulse.yml`:

```yaml
name: mascot-pulse

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  update-mascot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run tests
        run: node --test tests/

      - name: Compute and apply today's tier
        run: node scripts/update-mascot.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit mascot.svg if changed
        run: |
          if git diff --quiet -- mascot.svg; then
            echo "no change"
          else
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add mascot.svg
            git commit -m "mascot-pulse: sync animation to recent activity"
            git push
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/mascot-pulse.yml
git commit -m "Add mascot-pulse daily workflow"
```

- [ ] **Step 3: Push and confirm with the user before this step**

This is the first step in the whole plan that touches the remote. Stop here and get explicit user confirmation before running:

```bash
git push origin master
```

- [ ] **Step 4: End-to-end verification on GitHub**

After push, open the repo's Actions tab, select "mascot-pulse", click "Run workflow" (workflow_dispatch). Confirm:
1. The run's "Run tests" step passes (6/6).
2. The run's "Compute and apply today's tier" step logs a `commits(48h)=... tier=...` line.
3. If the tier differs from what's committed, a new commit appears on the branch with only `mascot.svg` changed, message `mascot-pulse: sync animation to recent activity`.
4. Visit `https://github.com/andrewlawsonza` (profile Overview) and confirm the mascot still renders and animates (breathe + blink loop visibly running).

---

## Self-review notes

- Spec coverage: architecture (script + workflow, no mascot-forge runtime dep) → Tasks 1–3; tier table → Task 1 test + Global Constraints; error handling (API failure → warn, exit 0, no write) → Task 2 Step 1 `catch` block; dry-run self-check → Task 2 Step 3; commit-only-if-changed → Task 1 `updateSvgDurations` + Task 2 `if (updated !== original)` + workflow's `git diff --quiet` guard; daily cron + manual dispatch → Task 3 Step 1; push requires confirmation → Task 3 Step 3.
- No placeholders — every step has complete, runnable code.
- Function names consistent across tasks: `computeTier`, `countRecentPushCommits`, `updateSvgDurations`, `fetchRecentEvents`, `main` — same names Task 1 defines are the exact names Task 2 and the workflow rely on.
