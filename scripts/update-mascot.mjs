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
