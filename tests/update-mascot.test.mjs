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
