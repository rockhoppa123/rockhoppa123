import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const USERNAME = 'andrewlawsonza';
const SVG_PATH = new URL('../mascot.svg', import.meta.url);

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
