/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cardText,
  DAY,
  DEFAULT_SETTINGS,
  deferPastQuietHours,
  describeStatus,
  doseWarning,
  getStatus,
  HOUR,
  MINUTE,
  normalizeMedication,
  planNotifications,
} from '../src/logic.ts';
import type { DoseRecord, Medication, Settings } from '../src/types.ts';

const med = (over: Partial<Medication> = {}): Medication =>
  normalizeMedication({
    id: 'm1',
    name: 'Paracetamol',
    dose: '2 tablets',
    minHours: 4,
    maxHours: 6,
    color: '#000',
    ...over,
  });
const dose = (takenAt: number, medId = 'm1'): DoseRecord => ({ id: String(takenAt), medId, takenAt });
/** Local time on 10 Jan 2026 (or a later day). */
const at = (h: number, m = 0, day = 10) => new Date(2026, 0, day, h, m).getTime();
const base = at(12);
const noQuiet: Settings = { ...DEFAULT_SETTINGS, quietHoursEnabled: false };
const S = DEFAULT_SETTINGS; // day starts 7:30am, last doses by 11:30pm, no alarms overnight

// ---------- Every few hours ----------

test('never taken is fine to take, with no alarm', () => {
  const s = getStatus(med(), [], base, S);
  assert.equal(s.kind, 'never');
  assert.equal(s.dueBy, null);
});

test('wait -> ready -> overdue as time passes', () => {
  const doses = [dose(base)];
  assert.equal(getStatus(med(), doses, base + 3 * HOUR, S).kind, 'wait');
  assert.equal(getStatus(med(), doses, base + 3 * HOUR, S).canTakeAt, base + 4 * HOUR);
  assert.equal(getStatus(med(), doses, base + 4 * HOUR, S).kind, 'ready');
  assert.equal(getStatus(med(), doses, base + 6 * HOUR, S).kind, 'overdue');
});

test('no maximum means never overdue', () => {
  assert.equal(getStatus(med({ maxHours: null }), [dose(base)], base + 2 * DAY, S).kind, 'ready');
});

test('uses the most recent dose and ignores other medications', () => {
  const doses = [dose(base - 5 * HOUR), dose(base - 1 * HOUR), dose(base, 'other')];
  const s = getStatus(med(), doses, base, S);
  assert.equal(s.lastTaken, base - HOUR);
  assert.equal(s.kind, 'wait');
});

test('24-hour limit blocks until the oldest dose drops out', () => {
  const m = med({ minHours: 4, maxHours: null, maxPerDay: 4 });
  const doses = [0, 4, 8, 12].map((h) => dose(base + h * HOUR));
  const s = getStatus(m, doses, base + 17 * HOUR, S);
  assert.equal(s.kind, 'wait');
  assert.equal(s.limitedByDailyMax, true);
  assert.equal(s.canTakeAt, base + 24 * HOUR);
  assert.equal(getStatus(m, doses, base + 24 * HOUR, S).kind, 'ready');
});

test('alarm is never earlier than the next allowed dose', () => {
  const m = med({ minHours: 4, maxHours: 6, maxPerDay: 2 });
  const s = getStatus(m, [dose(base), dose(base + 4 * HOUR)], base + 5 * HOUR, S);
  assert.equal(s.canTakeAt, base + 24 * HOUR);
  assert.equal(s.dueBy, base + 24 * HOUR);
});

test('plans a ready reminder plus repeating alarms', () => {
  const plan = planNotifications([med()], [dose(base)], noQuiet, base + MINUTE);
  assert.equal(plan[0].kind, 'ready');
  assert.equal(plan[0].at, base + 4 * HOUR);
  const alarms = plan.filter((p) => p.kind === 'overdue');
  assert.equal(alarms.length, S.alarmRepeatCount + 1);
  assert.equal(alarms[0].at, base + 6 * HOUR);
  assert.equal(alarms[1].at - alarms[0].at, S.alarmRepeatMinutes * MINUTE);
});

test('only remaining alarms are planned once overdue', () => {
  const plan = planNotifications([med()], [dose(base)], noQuiet, base + 6 * HOUR + 20 * MINUTE);
  assert.ok(plan.every((p) => p.kind === 'overdue' && p.at > base + 6 * HOUR + 20 * MINUTE));
  assert.equal(plan.length, S.alarmRepeatCount - 1);
});

// ---------- Overnight ----------

test('overnight alarms wait until the day starts', () => {
  const morning = at(7, 30, 11);
  assert.equal(deferPastQuietHours(at(3, 0, 11), S), morning);
  assert.equal(deferPastQuietHours(at(23, 30), S), at(23, 30), 'the last-doses-by time itself is not overnight');
  const plan = planNotifications([med()], [dose(at(21))], S, at(21, 1));
  const alarms = plan.filter((p) => p.kind === 'overdue');
  assert.equal(alarms[0].at, morning);
  // The "can take it" reminder (1am) would land overnight too, at the same moment as the alarm, so it's dropped.
  assert.equal(plan.filter((p) => p.kind === 'ready').length, 0);
});

test('with overnight alarms allowed, times are left alone', () => {
  assert.equal(deferPastQuietHours(at(3, 0, 11), noQuiet), at(3, 0, 11));
});

// ---------- Doses to fit in each day ----------

const paced = (over: Partial<Medication> = {}) => med({ minHours: 4, maxHours: 6, dailyTarget: 4, ...over });

test('first dose of the day is due early enough to fit all of them in', () => {
  // Last night's dose doesn't start a 6-hour countdown overnight.
  const s = getStatus(paced(), [dose(at(22, 0, 9))], at(9), S);
  assert.equal(s.kind, 'ready');
  assert.equal(s.dueBy, at(11, 30), '11:30pm minus three 4-hour gaps');
  assert.deepEqual(s.today, { taken: 0, target: 4, cutoff: at(23, 30), fits: 4 });
  assert.equal(describeStatus(paced(), s, at(9), S).headline, 'OK to take — take by 11:30am');
});

test('pace deadline wins over the maximum gap when he is behind', () => {
  // Took the first at 11am. Max gap says 5pm, but to fit 3 more before 11:30pm the next is due by 3:30pm.
  const s = getStatus(paced(), [dose(at(11))], at(12), S);
  assert.equal(s.kind, 'wait');
  assert.equal(s.canTakeAt, at(15));
  assert.equal(s.dueBy, at(15, 30));
});

test('maximum gap still applies when he is ahead of pace', () => {
  const s = getStatus(paced(), [dose(at(7, 30))], at(9), S);
  assert.equal(s.dueBy, at(13, 30), '7:30am + 6 hours, earlier than the pace deadline of 3:30pm');
});

test('dragging it out: warns that not all doses fit and alarms', () => {
  const s = getStatus(paced(), [dose(at(11)), dose(at(16, 30))], at(21), S);
  assert.equal(s.kind, 'overdue');
  assert.equal(s.today!.fits, 1);
  assert.ok(describeStatus(paced(), s, at(21), S).details.some((d) => d.includes('Only 1 more fit in before 11:30pm')));
});

test('done for today, with the next alarm for tomorrow', () => {
  const doses = [8, 12, 16, 20].map((h) => dose(at(h)));
  const s = getStatus(paced(), doses, at(21), S);
  assert.equal(s.kind, 'done');
  assert.equal(s.dueBy, at(11, 30, 11));
  assert.equal(describeStatus(paced(), s, at(21), S).headline, 'All 4 taken today ✓');
  const plan = planNotifications([paced()], doses, S, at(21));
  assert.equal(plan.filter((p) => p.kind === 'ready').length, 0);
  assert.deepEqual(
    plan.slice(0, 3).map((p) => [p.kind, p.at]),
    [
      ['warning', at(11, 0, 11)],
      ['warning', at(11, 15, 11)],
      ['overdue', at(11, 30, 11)],
    ],
  );
});

test('a dose just after midnight counts towards the day before', () => {
  const doses = [dose(at(12)), dose(at(16)), dose(at(20)), dose(at(0, 15, 11))];
  const s = getStatus(paced(), doses, at(1, 0, 11), S);
  assert.equal(s.today!.taken, 4);
  assert.equal(s.kind, 'done');
  // After the day rolls over (halfway through the night) the count starts again.
  assert.equal(getStatus(paced(), doses, at(8, 0, 11), S).today!.taken, 0);
});

test('warns about an extra dose once all of today are taken', () => {
  const m = paced({ maxHours: null });
  const doses = [8, 12, 16, 20].map((h) => dose(at(h)));
  assert.equal(doseWarning(m, doses, at(0, 30, 11), S)?.title, 'Paracetamol is done for today');
  assert.equal(doseWarning(m, doses.slice(0, 3), at(20), S), null);
});

// ---------- Meal times ----------

const withMeals = med({ name: 'Naproxen', schedule: 'meals', meals: ['breakfast', 'dinner'] });

test('meal dose is ready from an hour before the meal and overdue an hour after', () => {
  assert.equal(getStatus(withMeals, [], at(6, 30), S).kind, 'wait');
  assert.equal(getStatus(withMeals, [], at(6, 30), S).canTakeAt, at(7));
  assert.equal(getStatus(withMeals, [], at(7), S).kind, 'ready');
  assert.equal(getStatus(withMeals, [], at(8, 59), S).kind, 'ready');
  assert.equal(getStatus(withMeals, [], at(9), S).kind, 'overdue');
});

test('after taking the breakfast dose, the next is dinner', () => {
  const doses = [dose(at(8, 10))];
  const s = getStatus(withMeals, doses, at(10), S);
  assert.equal(s.kind, 'wait');
  assert.equal(s.meal!.key, 'dinner');
  assert.equal(s.meal!.time, at(18));
  assert.deepEqual(s.meal!.takenToday, [{ key: 'breakfast', at: at(8, 10) }]);
  assert.match(doseWarning(withMeals, doses, at(10), S)!.message, /breakfast dose was logged at 8:10am/);
});

test('a missed meal dose is dropped, not doubled up', () => {
  const s = getStatus(withMeals, [], at(14), S);
  assert.equal(s.meal!.key, 'dinner');
  assert.deepEqual(s.meal!.missedToday, ['breakfast']);
  assert.equal(s.kind, 'wait');
});

test('plans a meal-time reminder then alarms', () => {
  const plan = planNotifications([withMeals], [dose(at(8, 10))], S, at(10));
  assert.equal(plan[0].kind, 'ready');
  assert.equal(plan[0].at, at(18));
  assert.equal(plan[0].title, 'Time for Naproxen');
  assert.deepEqual(
    plan.slice(1, 4).map((p) => [p.kind, p.at]),
    [
      ['warning', at(18, 30)],
      ['warning', at(18, 45)],
      ['overdue', at(19)],
    ],
  );
});

test('old saved medication without a schedule still works', () => {
  const old = normalizeMedication({ id: 'x', name: 'Old', minHours: 4, maxHours: 6 } as Medication);
  assert.equal(old.schedule, 'interval');
  assert.equal(old.dailyTarget, null);
  assert.deepEqual(old.meals, []);
});

test('card shows the real alarm time when it falls overnight', () => {
  const s = getStatus(med(), [dose(at(18))], at(21), S);
  assert.equal(s.dueBy, at(0, 0, 11));
  assert.ok(describeStatus(med(), s, at(21), S).details.includes('Alarm if not taken by Tomorrow 7:30am'));
});

// ---------- Warnings before the alarm ----------

test('warns 30 and 15 minutes before the alarm by default', () => {
  const plan = planNotifications([med()], [dose(base)], noQuiet, base + MINUTE);
  assert.deepEqual(
    plan.slice(0, 4).map((p) => [p.kind, p.at]),
    [
      ['ready', base + 4 * HOUR],
      ['warning', base + 6 * HOUR - 30 * MINUTE],
      ['warning', base + 6 * HOUR - 15 * MINUTE],
      ['overdue', base + 6 * HOUR],
    ],
  );
  assert.equal(plan[1].title, 'Paracetamol: take within 30 min');
  assert.equal(plan[1].body, 'Take Paracetamol (2 tablets) by 6:00pm. The alarm goes off then if it hasn\'t been logged.');
});

test('last dose of the day: reminder, warnings at 11pm and 11:15pm, one alarm at 11:30pm', () => {
  const doses = [dose(at(8, 0)), dose(at(13, 0)), dose(at(18, 6))];
  const plan = planNotifications([paced()], doses, S, at(18, 7));
  assert.deepEqual(
    plan.map((p) => [p.kind, p.at]),
    [
      ['ready', at(22, 6)],
      ['warning', at(23, 0)],
      ['warning', at(23, 15)],
      // The alarm's repeats would all be after 11:30pm, so they're held overnight.
      ['overdue', at(23, 30)],
    ],
  );
});

test('no warning before he is allowed to take it', () => {
  // Allowed after 4 hours, alarm at 4 hours 20: the 30-minute warning would come too early, the 15 is fine.
  const plan = planNotifications([med({ minHours: 4, maxHours: 4 + 20 / 60 })], [dose(base)], noQuiet, base + MINUTE);
  assert.deepEqual(
    plan.filter((p) => p.kind === 'warning').map((p) => p.at),
    [base + 4 * HOUR + 5 * MINUTE],
  );
});

test('warnings can be turned off or changed', () => {
  const off = planNotifications([med()], [dose(base)], { ...noQuiet, warnBeforeMinutes: [] }, base + MINUTE);
  assert.equal(off.filter((p) => p.kind === 'warning').length, 0);
  const three = planNotifications([med()], [dose(base)], { ...noQuiet, warnBeforeMinutes: [15, 60, 30] }, base + MINUTE);
  assert.deepEqual(
    three.filter((p) => p.kind === 'warning').map((p) => (base + 6 * HOUR - p.at) / MINUTE),
    [60, 30, 15],
  );
});

test('no warnings overnight when the alarm is held until morning', () => {
  // Due at 3am, alarm held until 7:30am; warnings at 7:00 and 7:15 would still be overnight.
  const plan = planNotifications([med()], [dose(at(21))], S, at(21, 1));
  assert.equal(plan.filter((p) => p.kind === 'warning').length, 0);
});

// ---------- Card text (Steady design: one headline, at most one detail line) ----------

const card = (m: Medication, doses: DoseRecord[], now: number) => cardText(m, getStatus(m, doses, now, S), now, S);

test('card: take now, with the latest time', () => {
  assert.deepEqual(card(paced(), [dose(at(9, 30))], at(14)), { state: 'due', headline: 'Take by 3:30pm', detail: 'Last taken at 9:30am' });
});

test('card: not yet, with when it is OK', () => {
  assert.deepEqual(card(paced(), [dose(at(11))], at(12)), { state: 'wait', headline: 'OK from 3:00pm', detail: 'Last taken at 11:00am' });
});

test('card: overdue', () => {
  assert.deepEqual(card(med(), [dose(base)], base + 6 * HOUR + 25 * MINUTE), {
    state: 'overdue',
    headline: 'Overdue by 25 min',
    detail: 'Last taken at 12:00pm',
  });
});

test('card: falling behind says how many still fit', () => {
  assert.equal(card(paced(), [dose(at(11)), dose(at(16, 30))], at(21)).detail, 'Only 1 more fits in before 11:30pm');
});

test('card: done for today, and when tomorrow starts', () => {
  const doses = [8, 12, 16, 20].map((h) => dose(at(h)));
  assert.deepEqual(card(paced(), doses, at(21)), { state: 'done', headline: 'All 4 taken', detail: 'Tomorrow: first by 11:30am' });
});

test('card: as needed medicine', () => {
  assert.equal(card(med({ maxHours: null }), [dose(at(8))], at(14)).state, 'asNeeded');
  assert.equal(card(med({ maxHours: null }), [], at(14)).headline, 'OK to take if needed');
});

test('card: meal times', () => {
  assert.deepEqual(card(withMeals, [dose(at(8, 5))], at(10)), {
    state: 'wait',
    headline: 'Next: with dinner, 6:00pm',
    detail: 'Breakfast dose taken at 8:05am',
  });
  assert.deepEqual(card(withMeals, [], at(7, 30)), { state: 'due', headline: 'Take now, with breakfast', detail: null });
  assert.equal(card(withMeals, [], at(14)).detail, 'Missed today: Breakfast');
});

test('card: last taken yesterday', () => {
  assert.equal(card(med({ maxHours: null }), [dose(at(21, 0, 9))], at(9)).detail, 'Last taken yesterday at 9:00pm');
});

test('old saved medication gets a default pill picture', () => {
  assert.deepEqual(normalizeMedication({ id: 'x', name: 'Old' } as Medication).pill, { shape: 'round', color: 'white' });
});
