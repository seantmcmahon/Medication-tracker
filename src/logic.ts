import type { DoseRecord, Medication, MedStatus, Settings } from './types';

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const DEFAULT_SETTINGS: Settings = {
  quietHoursEnabled: false,
  quietStart: 22 * 60 + 30,
  quietEnd: 7 * 60 + 30,
  alarmRepeatMinutes: 15,
  alarmRepeatCount: 8,
};

export function dosesFor(medId: string, doses: DoseRecord[]): DoseRecord[] {
  return doses.filter((d) => d.medId === medId).sort((a, b) => b.takenAt - a.takenAt);
}

export function getStatus(med: Medication, doses: DoseRecord[], now: number): MedStatus {
  const mine = dosesFor(med.id, doses).filter((d) => d.takenAt <= now);
  const last = mine[0]?.takenAt ?? null;
  const inLast24h = mine.filter((d) => d.takenAt > now - DAY);

  if (last === null) {
    return {
      kind: 'never',
      lastTaken: null,
      canTakeAt: null,
      dueBy: null,
      takenLast24h: 0,
      limitedByDailyMax: false,
    };
  }

  let canTakeAt = last + med.minHours * HOUR;
  let limitedByDailyMax = false;
  if (med.maxPerDay !== null && inLast24h.length >= med.maxPerDay) {
    // The oldest dose that still counts towards the limit has to drop out of the 24h window.
    const blocking = inLast24h[med.maxPerDay - 1].takenAt + DAY;
    if (blocking > canTakeAt) {
      canTakeAt = blocking;
      limitedByDailyMax = true;
    }
  }

  // The alarm never fires before he is actually allowed to take another dose.
  const dueBy = med.maxHours === null ? null : Math.max(last + med.maxHours * HOUR, canTakeAt);

  let kind: MedStatus['kind'];
  if (now < canTakeAt) kind = 'wait';
  else if (dueBy !== null && now >= dueBy) kind = 'overdue';
  else kind = 'ready';

  return {
    kind,
    lastTaken: last,
    canTakeAt: now < canTakeAt ? canTakeAt : null,
    dueBy,
    takenLast24h: inLast24h.length,
    limitedByDailyMax: limitedByDailyMax && now < canTakeAt,
  };
}

function minutesOfDay(t: number): number {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

export function isInQuietHours(t: number, s: Settings): boolean {
  if (!s.quietHoursEnabled || s.quietStart === s.quietEnd) return false;
  const m = minutesOfDay(t);
  return s.quietStart < s.quietEnd
    ? m >= s.quietStart && m < s.quietEnd
    : m >= s.quietStart || m < s.quietEnd;
}

/** Moves a time that falls inside quiet hours to the end of the quiet period. */
export function deferPastQuietHours(t: number, s: Settings): number {
  if (!isInQuietHours(t, s)) return t;
  const d = new Date(t);
  const end = new Date(d);
  end.setHours(Math.floor(s.quietEnd / 60), s.quietEnd % 60, 0, 0);
  if (end.getTime() <= t) end.setDate(end.getDate() + 1);
  return end.getTime();
}

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
    const status = getStatus(med, doses, now);
    const label = med.dose ? `${med.name} (${med.dose})` : med.name;
    const alarmTimes: number[] = [];

    if (status.dueBy !== null) {
      const first = deferPastQuietHours(status.dueBy, settings);
      for (let i = 0; i <= settings.alarmRepeatCount; i++) {
        const at = first + i * settings.alarmRepeatMinutes * MINUTE;
        if (at > now && !isInQuietHours(at, settings)) alarmTimes.push(at);
      }
    }

    if (status.canTakeAt !== null) {
      const at = deferPastQuietHours(status.canTakeAt, settings);
      // No point in a gentle "you can take it" if the alarm goes off at the same moment.
      if (at > now && !alarmTimes.some((a) => a <= at)) {
        plan.push({
          id: `${med.id}:ready`,
          medId: med.id,
          kind: 'ready',
          at,
          title: `${med.name} can be taken now`,
          body: `It's been long enough since the last dose. You can take ${label} when you need it.`,
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
        body: `${label} is due. Open the app and tap "I've taken it" once you have.`,
      });
    });
  }
  return plan.sort((a, b) => a.at - b.at);
}

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

export function formatHours(hours: number): string {
  return formatDuration(hours * HOUR);
}

/** Keeps the dose history from growing forever. */
export function pruneDoses(doses: DoseRecord[], now: number, keepDays = 60): DoseRecord[] {
  return doses.filter((d) => d.takenAt > now - keepDays * DAY);
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
