/// <reference types="node" />
// Run with TZ=UTC, like Cloudflare Workers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, MINUTE, normalizeMedication } from '../../src/logic.ts';
import type { DoseRecord, Medication } from '../../src/types.ts';
import {
  applySync,
  emptyState,
  handleCommand,
  tick,
  tzOffset,
  type ServerState,
  type SyncPayload,
} from '../src/engine.ts';

assert.equal(new Date(0).getTimezoneOffset(), 0, 'run these tests with TZ=UTC');

/** A time in London on 12 Oct 2026 (British Summer Time, UTC+1). */
const london = (h: number, m = 0, day = 12) => Date.UTC(2026, 9, day, h - 1, m);

const cocodamol = normalizeMedication({
  id: 'cc',
  name: 'Co-codamol',
  dose: '2 tablets',
  minHours: 4,
  maxHours: 6,
  maxPerDay: 4,
  dailyTarget: 4,
});
const naproxen = normalizeMedication({
  id: 'np',
  name: 'Naproxen',
  dose: '500mg',
  schedule: 'meals',
  meals: ['breakfast', 'dinner'],
});
const meds: Medication[] = [cocodamol, naproxen];
const dose = (id: string, medId: string, takenAt: number): DoseRecord => ({ id, medId, takenAt });

const payload = (doses: DoseRecord[]): SyncPayload => ({
  tz: 'Europe/London',
  meds,
  doses,
  settings: DEFAULT_SETTINGS,
  family: { name: 'Dad', bufferMinutes: 5, lateMinutes: 30 },
});

function withSubscribers(state: ServerState): ServerState {
  return {
    ...state,
    subscribers: {
      '1': { name: 'Sean', taken: true, summary: true },
      '2': { name: 'Amy', taken: false, summary: false },
    },
  };
}

function started(doses: DoseRecord[] = [], at = london(7)): ServerState {
  return withSubscribers(applySync(emptyState(), payload(doses), at));
}

test('time zone offset follows British Summer Time', () => {
  assert.equal(tzOffset('Europe/London', london(12)), 60 * MINUTE);
  assert.equal(tzOffset('Europe/London', Date.UTC(2026, 11, 1, 12)), 0);
});

test('the first sync never announces old doses', () => {
  const s = started([dose('a', 'cc', london(6))]);
  assert.equal(s.queue.length, 0);
});

test('doses taken close together go out as one message', () => {
  let s = started();
  s = applySync(s, payload([dose('a', 'cc', london(8))]), london(8));
  assert.equal(s.sendAt, london(8, 5));
  s = applySync(s, payload([dose('a', 'cc', london(8)), dose('b', 'np', london(8, 3))]), london(8, 3));
  assert.equal(s.sendAt, london(8, 5), 'a later update does not push the send time back');

  assert.equal(tick(s, london(8, 4)).messages.length, 0);
  const { state, messages } = tick(s, london(8, 5));
  assert.equal(messages.length, 1, 'only the subscriber who wants taken updates gets one');
  assert.equal(messages[0].chatId, '1');
  assert.match(messages[0].text, /Co-codamol \(2 tablets\) taken at 8:00am/);
  assert.match(messages[0].text, /Naproxen \(500mg\) taken at 8:03am/);
  assert.equal(state.queue.length, 0);
  assert.equal(state.sendAt, null);
});

test('an undone dose is never announced', () => {
  let s = started();
  s = applySync(s, payload([dose('a', 'cc', london(8))]), london(8));
  s = applySync(s, payload([]), london(8, 1));
  assert.equal(s.queue.length, 0);
  assert.equal(s.sendAt, null);
  assert.equal(tick(s, london(8, 10)).messages.length, 0);
});

test('missed dose alert goes to everyone once, and the late dose settles it', () => {
  // Co-codamol at 8am; next due by 2pm (6-hour maximum). Alarm has been going 30 minutes at 2:30pm.
  const morning = [dose('a', 'cc', london(8)), dose('b', 'np', london(8)), dose('c', 'np', london(18, 0, 11))];
  let s = started(morning, london(8, 1));
  s = tick(s, london(14, 29)).state;
  assert.equal(s.queue.length, 0);
  s = tick(s, london(14, 30)).state;
  assert.equal(s.queue.length, 1);
  const sent = tick(s, london(14, 35));
  assert.equal(sent.messages.length, 2, 'missed-dose alerts go to everyone');
  assert.match(sent.messages[0].text, /needs attention/);
  assert.match(sent.messages[0].text, /Co-codamol \(2 tablets\) hasn't been taken\. It was due by 2:00pm\./);
  s = sent.state;
  assert.equal(tick(s, london(14, 50)).state.queue.length, 0, 'not repeated');

  s = applySync(s, payload([...morning, dose('d', 'cc', london(14, 52))]), london(14, 52));
  const settled = tick(s, london(14, 57));
  assert.equal(settled.messages.length, 2, 'everyone hears it was taken after the alert');
  assert.match(settled.messages[1].text, /taken at 2:52pm \(after the missed-dose alert\)/);
});

test('a missed meal-time dose is reported', () => {
  let s = started([dose('a', 'cc', london(8))], london(7));
  // Breakfast 8am, alarm at 9am, family told at 9:30am.
  s = tick(s, london(9, 30)).state;
  const { messages } = tick(s, london(9, 35));
  assert.match(messages[0].text, /Naproxen \(500mg\) hasn't been taken\. It was due by 9:00am\./);
});

test('overnight alarms are not reported until the morning', () => {
  const lateNight = [dose('a', 'cc', london(8)), dose('b', 'cc', london(12)), dose('c', 'cc', london(16)), dose('d', 'cc', london(20))];
  let s = started(lateNight, london(20, 1));
  s = { ...s, meds: [cocodamol] };
  // All four taken: the next is due by 11:30am tomorrow, so nothing overnight.
  for (const t of [london(23, 59), london(3, 0, 13), london(11, 59, 13)]) s = tick(s, t).state;
  assert.equal(s.queue.length, 0);
  s = tick(s, london(12, 0, 13)).state;
  assert.equal(s.queue.length, 1);
});

test('nightly summary after the last-doses-by time', () => {
  const day = [
    dose('a', 'cc', london(8)),
    dose('b', 'cc', london(12)),
    dose('c', 'cc', london(16)),
    dose('d', 'np', london(8, 10)),
  ];
  let s = started(day, london(16, 1));
  s = { ...s, alerted: { cc: Infinity, np: Infinity } as Record<string, number> }; // ignore missed alerts here
  assert.equal(tick(s, london(23, 34)).messages.filter((m) => m.text.includes('today')).length, 0);
  const { state, messages } = tick(s, london(23, 35));
  const summary = messages.find((m) => m.text.startsWith('🌙'));
  assert.ok(summary);
  assert.equal(summary.chatId, '1', 'only to people who want it');
  assert.match(summary.text, /⚠️ Co-codamol: 3 of 4 \(8:00am, 12:00pm, 4:00pm\)/);
  assert.match(summary.text, /⚠️ Naproxen: breakfast ✓, dinner ✗/);
  assert.equal(tick(state, london(23, 50)).messages.filter((m) => m.text.startsWith('🌙')).length, 0, 'once a day');
});

test('only people with the invite code can join', () => {
  const s = started();
  const stranger = handleCommand(s, '99', 'Eve', '/start', 'secret123', london(9));
  assert.match(stranger.reply, /private/);
  assert.equal(stranger.state.subscribers['99'], undefined);
  assert.match(handleCommand(s, '99', 'Eve', '/status', 'secret123', london(9)).reply, /private/);

  const joined = handleCommand(s, '42', 'Kate', '/start secret123', 'secret123', london(9));
  assert.deepEqual(joined.state.subscribers['42'], { name: 'Kate', taken: true, summary: true });
  const quiet = handleCommand(joined.state, '42', 'Kate', '/updates_off', 'secret123', london(9));
  assert.equal(quiet.state.subscribers['42'].taken, false);
  const status = handleCommand(quiet.state, '42', 'Kate', '/status', 'secret123', london(9));
  assert.match(status.reply, /Co-codamol: OK to take — take by 11:30am/);
  const gone = handleCommand(quiet.state, '42', 'Kate', '/stop', 'secret123', london(9));
  assert.equal(gone.state.subscribers['42'], undefined);
});
