/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY, DEFAULT_SETTINGS, deferPastQuietHours, getStatus, HOUR, MINUTE, planNotifications } from '../src/logic.ts';
import type { DoseRecord, Medication } from '../src/types.ts';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1',
  name: 'Paracetamol',
  dose: '2 tablets',
  minHours: 4,
  maxHours: 6,
  maxPerDay: null,
  color: '#000',
  notes: '',
  ...over,
});
const dose = (takenAt: number, medId = 'm1'): DoseRecord => ({ id: String(takenAt), medId, takenAt });
const base = new Date(2026, 0, 10, 12, 0).getTime(); // noon local time

test('never taken is fine to take, with no alarm', () => {
  const s = getStatus(med(), [], base);
  assert.equal(s.kind, 'never');
  assert.equal(s.dueBy, null);
});

test('wait -> ready -> overdue as time passes', () => {
  const doses = [dose(base)];
  assert.equal(getStatus(med(), doses, base + 3 * HOUR).kind, 'wait');
  assert.equal(getStatus(med(), doses, base + 3 * HOUR).canTakeAt, base + 4 * HOUR);
  assert.equal(getStatus(med(), doses, base + 4 * HOUR).kind, 'ready');
  assert.equal(getStatus(med(), doses, base + 6 * HOUR).kind, 'overdue');
});

test('no maximum means never overdue', () => {
  assert.equal(getStatus(med({ maxHours: null }), [dose(base)], base + 2 * DAY).kind, 'ready');
});

test('uses the most recent dose and ignores other medications', () => {
  const doses = [dose(base - 5 * HOUR), dose(base - 1 * HOUR), dose(base, 'other')];
  const s = getStatus(med(), doses, base);
  assert.equal(s.lastTaken, base - HOUR);
  assert.equal(s.kind, 'wait');
});

test('daily limit blocks until the oldest dose drops out of 24h', () => {
  const m = med({ minHours: 4, maxHours: null, maxPerDay: 4 });
  const doses = [0, 4, 8, 12].map((h) => dose(base + h * HOUR));
  const now = base + 17 * HOUR;
  const s = getStatus(m, doses, now);
  assert.equal(s.kind, 'wait');
  assert.equal(s.limitedByDailyMax, true);
  assert.equal(s.canTakeAt, base + 24 * HOUR);
  assert.equal(getStatus(m, doses, base + 24 * HOUR).kind, 'ready');
});

test('alarm is never earlier than the next allowed dose', () => {
  const m = med({ minHours: 4, maxHours: 6, maxPerDay: 2 });
  const doses = [dose(base), dose(base + 4 * HOUR)];
  const s = getStatus(m, doses, base + 5 * HOUR);
  assert.equal(s.canTakeAt, base + 24 * HOUR);
  assert.equal(s.dueBy, base + 24 * HOUR);
});

test('plans a ready reminder plus repeating alarms', () => {
  const plan = planNotifications([med()], [dose(base)], DEFAULT_SETTINGS, base + MINUTE);
  assert.equal(plan[0].kind, 'ready');
  assert.equal(plan[0].at, base + 4 * HOUR);
  const alarms = plan.filter((p) => p.kind === 'overdue');
  assert.equal(alarms.length, DEFAULT_SETTINGS.alarmRepeatCount + 1);
  assert.equal(alarms[0].at, base + 6 * HOUR);
  assert.equal(alarms[1].at - alarms[0].at, DEFAULT_SETTINGS.alarmRepeatMinutes * MINUTE);
});

test('only remaining alarms are planned once overdue', () => {
  const plan = planNotifications([med()], [dose(base)], DEFAULT_SETTINGS, base + 6 * HOUR + 20 * MINUTE);
  assert.ok(plan.every((p) => p.kind === 'overdue' && p.at > base + 6 * HOUR + 20 * MINUTE));
  assert.equal(plan.length, DEFAULT_SETTINGS.alarmRepeatCount - 1);
});

test('quiet hours push alarms to the morning', () => {
  const settings = { ...DEFAULT_SETTINGS, quietHoursEnabled: true, quietStart: 22 * 60, quietEnd: 7 * 60 };
  const lateDose = new Date(2026, 0, 10, 21, 0).getTime();
  const morning = new Date(2026, 0, 11, 7, 0).getTime();
  assert.equal(deferPastQuietHours(lateDose + 5 * HOUR, settings), morning);
  const plan = planNotifications([med()], [dose(lateDose)], settings, lateDose + MINUTE);
  const alarms = plan.filter((p) => p.kind === 'overdue');
  assert.equal(alarms[0].at, morning);
  // Ready reminder would land at the same moment as the alarm, so it's skipped.
  assert.equal(plan.filter((p) => p.kind === 'ready').length, 0);
});

test('quiet hours off leaves times alone', () => {
  const t = new Date(2026, 0, 11, 3, 0).getTime();
  assert.equal(deferPastQuietHours(t, DEFAULT_SETTINGS), t);
});
