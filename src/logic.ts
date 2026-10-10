import type { DoseRecord, MealKey, Medication, MedStatus, Settings } from './types';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A meal-time dose can be taken up to this long before the meal. */
export const MEAL_EARLY_MINUTES = 60;

export const MEALS: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'bedtime', label: 'Bedtime' },
];

export const mealLabel = (key: MealKey) => MEALS.find((m) => m.key === key)!.label;

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 7 * 60 + 30,
  lastDoseBy: 23 * 60 + 30,
  quietHoursEnabled: true,
  mealTimes: { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 18 * 60, bedtime: 22 * 60 + 30 },
  mealGraceMinutes: 60,
  alarmRepeatMinutes: 15,
  alarmRepeatCount: 8,
};

/** Fills in fields added since a medication was first saved. */
export function normalizeMedication(m: Partial<Medication> & Pick<Medication, 'id' | 'name'>): Medication {
  const defaults: Omit<Medication, 'id' | 'name'> = {
    dose: '',
    schedule: 'interval',
    minHours: 4,
    maxHours: null,
    maxPerDay: null,
    dailyTarget: null,
    meals: [],
    color: '#1565C0',
    notes: '',
  };
  return { ...defaults, ...m } as Medication;
}

// ---------- Clock helpers ----------

function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** The given minutes-after-midnight on the same calendar day as t. */
function atMinutes(t: number, minutes: number): number {
  const d = new Date(t);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

/** First time at or after t that the clock reads `minutes`. */
function nextAt(t: number, minutes: number): number {
  const x = atMinutes(t, minutes);
  return x >= t ? x : atMinutes(addDays(t, 1), minutes);
}

/** Last time at or before t that the clock reads `minutes`. */
function prevAt(t: number, minutes: number): number {
  const x = atMinutes(t, minutes);
  return x <= t ? x : atMinutes(addDays(t, -1), minutes);
}

function minutesOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * His "day" for counting doses runs from the middle of the night to the middle of the next night,
 * so a dose taken just after midnight still counts towards the day before.
 */
export function dayBounds(t: number, s: Settings): { start: number; cutoff: number; nextStart: number } {
  const night = (s.dayStart - s.lastDoseBy + 24 * 60) % (24 * 60);
  const boundary = (s.lastDoseBy + Math.floor(night / 2)) % (24 * 60);
  const start = prevAt(t, boundary);
  const nextStart = nextAt(start + MINUTE, boundary);
  return { start, cutoff: nextAt(start, s.lastDoseBy), nextStart };
}

/** Overnight is after the "last doses by" time and before the day starts. */
export function isInQuietHours(t: number, s: Settings): boolean {
  if (!s.quietHoursEnabled || s.lastDoseBy === s.dayStart) return false;
  const m = minutesOfDay(t);
  return s.lastDoseBy < s.dayStart ? m > s.lastDoseBy && m < s.dayStart : m > s.lastDoseBy || m < s.dayStart;
}

/** Moves a time that falls overnight to the start of the next day. */
export function deferPastQuietHours(t: number, s: Settings): number {
  return isInQuietHours(t, s) ? nextAt(t, s.dayStart) : t;
}

// ---------- Status ----------

export function dosesFor(medId: string, doses: DoseRecord[]): DoseRecord[] {
  return doses.filter((d) => d.medId === medId).sort((a, b) => b.takenAt - a.takenAt);
}

export function getStatus(med: Medication, doses: DoseRecord[], now: number, s: Settings): MedStatus {
  const mine = dosesFor(med.id, doses).filter((d) => d.takenAt <= now);
  return med.schedule === 'meals' ? mealStatus(med, mine, now, s) : intervalStatus(med, mine, now, s);
}

function intervalStatus(med: Medication, mine: DoseRecord[], now: number, s: Settings): MedStatus {
  const last = mine[0]?.takenAt ?? null;
  const inLast24h = mine.filter((d) => d.takenAt > now - DAY);
  const gap = med.minHours * HOUR;

  let allowedAt = last === null ? now : last + gap;
  let limitedByDailyMax = false;
  if (med.maxPerDay !== null && inLast24h.length >= med.maxPerDay) {
    // The oldest dose that still counts towards the limit has to drop out of the 24h window.
    const blocking = inLast24h[med.maxPerDay - 1].takenAt + DAY;
    if (blocking > allowedAt) {
      allowedAt = blocking;
      limitedByDailyMax = true;
    }
  }
  const waiting = now < allowedAt;
  const maxGapDue = last !== null && med.maxHours !== null ? last + med.maxHours * HOUR : null;
  const base = {
    lastTaken: last,
    canTakeAt: waiting ? allowedAt : null,
    remindAt: waiting ? allowedAt : null,
    takenLast24h: inLast24h.length,
    limitedByDailyMax: limitedByDailyMax && waiting,
  };

  if (med.dailyTarget === null) {
    // The alarm never fires before he is actually allowed to take another dose.
    const dueBy = maxGapDue === null ? null : Math.max(maxGapDue, allowedAt);
    const kind = waiting ? 'wait' : dueBy !== null && now >= dueBy ? 'overdue' : last === null ? 'never' : 'ready';
    return { ...base, kind, dueBy };
  }

  const { start, cutoff, nextStart } = dayBounds(now, s);
  const taken = mine.filter((d) => d.takenAt >= start).length;
  const target = med.dailyTarget;
  const remaining = target - taken;
  const firstAllowed = Math.max(now, allowedAt);
  const fits = firstAllowed > cutoff ? 0 : Math.min(remaining, 1 + Math.floor((cutoff - firstAllowed) / gap));
  const today = { taken, target, cutoff, fits: Math.max(0, fits) };

  if (remaining > 0 && fits > 0) {
    // Latest time for the next dose that still leaves room for the rest before the cutoff.
    const pace = cutoff - (remaining - 1) * gap;
    // The maximum gap doesn't stretch across the night: the first dose of the day is paced instead.
    const gapDue = maxGapDue !== null && last! >= start ? maxGapDue : null;
    const dueBy = Math.max(gapDue === null ? pace : Math.min(gapDue, pace), allowedAt);
    const kind = waiting ? 'wait' : now >= dueBy ? 'overdue' : 'ready';
    return { ...base, kind, dueBy, today };
  }

  // Finished for today. The next alarm is for the latest time to start tomorrow's doses.
  const nextCutoff = nextAt(nextStart, s.lastDoseBy);
  const dueBy = Math.max(nextCutoff - (target - 1) * gap, allowedAt, nextAt(nextStart, s.dayStart));
  return { ...base, kind: 'done', remindAt: null, dueBy, today };
}

function mealStatus(med: Medication, mine: DoseRecord[], now: number, s: Settings): MedStatus {
  const last = mine[0]?.takenAt ?? null;
  const base = {
    lastTaken: last,
    takenLast24h: mine.filter((d) => d.takenAt > now - DAY).length,
    limitedByDailyMax: false,
  };
  const keys = MEALS.map((m) => m.key).filter((k) => med.meals.includes(k));
  if (keys.length === 0) return { ...base, kind: last === null ? 'never' : 'ready', canTakeAt: null, remindAt: null, dueBy: null };

  // Every meal time from yesterday to the day after tomorrow, in order.
  const slots: { key: MealKey; at: number }[] = [];
  for (const d of [-1, 0, 1, 2]) {
    const day = addDays(now, d);
    for (const key of keys) slots.push({ key, at: atMinutes(day, s.mealTimes[key]) });
  }
  slots.sort((a, b) => a.at - b.at);

  // Each dose belongs to whichever meal time it's closest to.
  const windowOf = (i: number) => ({
    start: (slots[i - 1].at + slots[i].at) / 2,
    end: (slots[i].at + slots[i + 1].at) / 2,
  });
  const doseFor = (i: number) => {
    const w = windowOf(i);
    return mine.find((d) => d.takenAt >= w.start && d.takenAt < w.end);
  };

  const { start: dayStart, nextStart } = dayBounds(now, s);
  const takenToday: { key: MealKey; at: number }[] = [];
  const missedToday: MealKey[] = [];
  let next = -1;
  for (let i = 1; i < slots.length - 1; i++) {
    const dose = doseFor(i);
    const isToday = slots[i].at >= dayStart && slots[i].at < nextStart;
    if (dose) {
      if (isToday) takenToday.push({ key: slots[i].key, at: dose.takenAt });
      continue;
    }
    // A missed dose is dropped once the next meal comes round, never doubled up.
    if (windowOf(i).end <= now) {
      if (isToday) missedToday.push(slots[i].key);
      continue;
    }
    if (next === -1) next = i;
  }

  const slot = slots[next];
  const opensAt = Math.max(windowOf(next).start, slot.at - MEAL_EARLY_MINUTES * MINUTE);
  const dueBy = slot.at + s.mealGraceMinutes * MINUTE;
  const kind = now < opensAt ? 'wait' : now >= dueBy ? 'overdue' : 'ready';
  return {
    ...base,
    kind,
    canTakeAt: now < opensAt ? opensAt : null,
    remindAt: slot.at > now ? slot.at : null,
    dueBy,
    meal: { key: slot.key, time: slot.at, takenToday, missedToday },
  };
}

/** Text for the medication's card: one headline and a few detail lines. */
export function describeStatus(
  med: Medication,
  st: MedStatus,
  now: number,
  s: Settings,
): { headline: string; details: string[] } {
  const details: string[] = [];

  if (st.meal) {
    const meal = mealLabel(st.meal.key).toLowerCase();
    const headline =
      st.kind === 'wait'
        ? `Next: with ${meal} at ${formatTime(st.meal.time)}`
        : st.kind === 'overdue'
          ? `${mealLabel(st.meal.key)} dose overdue by ${formatDuration(now - st.dueBy!)}`
          : `Take now — with ${meal} (${formatTime(st.meal.time)})`;
    if (st.meal.takenToday.length > 0) {
      details.push(`Taken today: ${st.meal.takenToday.map((t) => `${mealLabel(t.key)} ${formatTime(t.at)}`).join(', ')}`);
    }
    if (st.meal.missedToday.length > 0) details.push(`Missed today: ${st.meal.missedToday.map(mealLabel).join(', ')}`);
    if (st.kind === 'ready') details.push(`Alarm at ${formatTime(st.dueBy!)} if not taken`);
    return { headline, details };
  }

  let headline: string;
  switch (st.kind) {
    case 'never':
      headline = 'No doses logged yet';
      break;
    case 'wait':
      headline = `Wait until ${formatTime(st.canTakeAt!)} (${formatDuration(st.canTakeAt! - now)})`;
      break;
    case 'ready':
      headline =
        st.dueBy === null
          ? 'OK to take if needed'
          : st.today
            ? `OK to take — take by ${formatTime(st.dueBy)}`
            : `OK to take — due by ${formatTime(st.dueBy)}`;
      break;
    case 'overdue':
      headline = `Overdue by ${formatDuration(now - st.dueBy!)}`;
      break;
    case 'done':
      headline =
        st.today && st.today.taken >= st.today.target
          ? `All ${st.today.target} taken today ✓`
          : 'No more doses today';
  }

  if (st.lastTaken !== null) {
    details.push(`Last taken: ${formatDayTime(st.lastTaken, now)} (${formatDuration(now - st.lastTaken)} ago)`);
  }
  if (st.today) {
    const { taken, target, cutoff, fits } = st.today;
    const remaining = target - taken;
    if (st.kind === 'done') {
      if (taken < target) details.push(`Today: ${taken} of ${target} taken`);
      details.push(`Tomorrow: take the first by ${formatTime(st.dueBy!)}`);
    } else if (fits < remaining) {
      details.push(`Today: ${taken} of ${target} taken. Only ${fits} more fit in before ${formatTime(cutoff)}`);
    } else {
      details.push(`Today: ${taken} of ${target} taken. Last one by ${formatTime(cutoff)}`);
    }
  }
  if (st.kind === 'wait' && st.limitedByDailyMax) {
    details.push(`Daily limit reached (${med.maxPerDay} in 24 hours)`);
  } else if (med.maxPerDay !== null) {
    details.push(`Taken ${st.takenLast24h} of ${med.maxPerDay} allowed in the last 24 hours`);
  }
  if (st.kind === 'wait' && st.dueBy !== null) {
    // Show when the alarm will really sound, which is later if it falls overnight.
    const alarmAt = deferPastQuietHours(st.dueBy, s);
    details.push(`${st.today ? 'Take by' : 'Alarm if not taken by'} ${formatDayTime(alarmAt, now)}`);
  }
  return { headline, details };
}

/** Why logging a dose at `at` might be a mistake, or null if it looks fine. */
export function doseWarning(
  med: Medication,
  doses: DoseRecord[],
  at: number,
  s: Settings,
): { title: string; message: string } | null {
  const st = getStatus(med, doses, at, s);

  if (st.meal) {
    if (st.kind !== 'wait') return null;
    const prev = st.meal.takenToday[st.meal.takenToday.length - 1];
    const already = prev ? `Today's ${mealLabel(prev.key).toLowerCase()} dose was logged at ${formatTime(prev.at)}. ` : '';
    return {
      title: '⚠️ Not time yet',
      message: `${already}The next dose of ${med.name} is with ${mealLabel(st.meal.key).toLowerCase()} (${formatTime(st.meal.time)}).`,
    };
  }

  if (st.canTakeAt !== null) {
    const reason = st.limitedByDailyMax
      ? `You've already had ${med.maxPerDay} doses of ${med.name} in the last 24 hours.`
      : `The last dose of ${med.name} was only ${formatDuration(at - st.lastTaken!)} before this. ` +
        `The minimum gap is ${formatDuration(med.minHours * HOUR)}.`;
    return { title: '⚠️ Too soon', message: `${reason}\n\nIt's OK to take from ${formatTime(st.canTakeAt)}.` };
  }
  if (st.kind === 'done' && st.today && st.today.taken >= st.today.target) {
    return {
      title: '⚠️ Already done today',
      message: `You've already had all ${st.today.target} doses of ${med.name} today.`,
    };
  }
  return null;
}

// ---------- Notifications ----------

export type PlannedNotification = {
  id: string;
  medId: string;
  kind: 'ready' | 'overdue';
  at: number;
  title: string;
  body: string;
};

/** Works out every reminder and alarm that should currently be scheduled. */
export function planNotifications(
  meds: Medication[],
  doses: DoseRecord[],
  settings: Settings,
  now: number,
): PlannedNotification[] {
  const plan: PlannedNotification[] = [];
  for (const med of meds) {
    const status = getStatus(med, doses, now, settings);
    const label = med.dose ? `${med.name} (${med.dose})` : med.name;
    const meal = status.meal ? mealLabel(status.meal.key).toLowerCase() : null;
    const alarmTimes: number[] = [];

    if (status.dueBy !== null) {
      const first = deferPastQuietHours(status.dueBy, settings);
      for (let i = 0; i <= settings.alarmRepeatCount; i++) {
        const at = first + i * settings.alarmRepeatMinutes * MINUTE;
        if (at > now && !isInQuietHours(at, settings)) alarmTimes.push(at);
      }
    }

    if (status.remindAt !== null) {
      const at = deferPastQuietHours(status.remindAt, settings);
      // No point in a gentle reminder if the alarm goes off at the same moment.
      if (at > now && !alarmTimes.some((a) => a <= at)) {
        plan.push({
          id: `${med.id}:ready`,
          medId: med.id,
          kind: 'ready',
          at,
          title: meal ? `Time for ${med.name}` : `${med.name} can be taken now`,
          body: meal
            ? `Take ${label} with ${meal}.`
            : `It's been long enough since the last dose. You can take ${label} when you need it.`,
        });
      }
    }

    alarmTimes.forEach((at, i) => {
      plan.push({
        id: `${med.id}:overdue:${i}`,
        medId: med.id,
        kind: 'overdue',
        at,
        title: `⏰ Time to take ${med.name}!`,
        body: meal
          ? `${label} should be taken with ${meal}. Open the app and tap "I've taken it" once you have.`
          : status.today
            ? `Take ${label} now to fit in all of today's doses. Then tap "I've taken it" in the app.`
            : `${label} is due. Open the app and tap "I've taken it" once you have.`,
      });
    });
  }
  return plan.sort((a, b) => a.at - b.at);
}

// ---------- Formatting ----------

export function formatTime(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

export function formatClock(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return formatTime(d.getTime());
}

/** "Today 2:15pm", "Yesterday 9:00am", or "Mon 3 Oct 9:00am". */
export function formatDayTime(t: number, now: number): string {
  const d = new Date(t);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (diffDays === 0) return `Today ${formatTime(t)}`;
  if (diffDays === 1) return `Yesterday ${formatTime(t)}`;
  if (diffDays === -1) return `Tomorrow ${formatTime(t)}`;
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${formatTime(t)}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MINUTE));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** Keeps the dose history from growing forever. */
export function pruneDoses(doses: DoseRecord[], now: number, keepDays = 60): DoseRecord[] {
  return doses.filter((d) => d.takenAt > now - keepDays * DAY);
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
