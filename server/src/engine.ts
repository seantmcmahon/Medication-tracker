/**
 * Everything the alerts server decides, as plain functions over a state object, so it can be tested
 * without Cloudflare or Telegram. The timing rules are the app's own (src/logic.ts).
 */
import {
  dayBounds,
  deferPastQuietHours,
  describeStatus,
  formatTime,
  getStatus,
  MEALS,
  MINUTE,
} from '../../src/logic.ts';
import type { DoseRecord, Medication, TimingSettings } from '../../src/types.ts';

export type FamilyConfig = {
  /** How he's referred to in messages, e.g. "Dad". */
  name: string;
  /** Updates within this many minutes of the first one are sent together. */
  bufferMinutes: number;
  /** Tell the family once his overdue alarm has been going this long. */
  lateMinutes: number;
};

/** What the app sends on every change. */
export type SyncPayload = {
  tz: string;
  meds: Medication[];
  doses: DoseRecord[];
  settings: TimingSettings;
  family: FamilyConfig;
};

export type Subscriber = {
  name: string;
  /** Wants a message each time a dose is taken (missed-dose alerts are always sent). */
  taken: boolean;
  /** Wants the nightly summary. */
  summary: boolean;
};

export type QueuedEvent =
  | { kind: 'taken'; doseId: string; medId: string; at: number; afterAlert: boolean }
  | { kind: 'missed'; medId: string; dueBy: number };

export type ServerState = {
  tz: string;
  meds: Medication[];
  doses: DoseRecord[];
  settings: TimingSettings | null;
  family: FamilyConfig;
  lastSync: number;
  knownDoseIds: string[];
  subscribers: Record<string, Subscriber>;
  queue: QueuedEvent[];
  /** When the current group of updates gets sent. */
  sendAt: number | null;
  /** The due time each medication's missed-dose alert was last sent for (wall-clock ms), so it's sent once. */
  alerted: Record<string, number>;
  /** Medications with a missed-dose alert that hasn't been followed by a dose yet. */
  openAlerts: Record<string, true>;
  /** Day key (YYYY-MM-DD) of the last nightly summary. */
  lastSummaryDay: string | null;
};

export type OutgoingMessage = { chatId: string; text: string };

export const emptyState = (): ServerState => ({
  tz: 'Europe/London',
  meds: [],
  doses: [],
  settings: null,
  family: { name: 'Dad', bufferMinutes: 5, lateMinutes: 30 },
  lastSync: 0,
  knownDoseIds: [],
  subscribers: {},
  queue: [],
  sendAt: null,
  alerted: {},
  openAlerts: {},
  lastSummaryDay: null,
});

// ---------- Time zones ----------
// The app's timing code works in the phone's local time. The server runs in UTC, so it shifts every
// timestamp into "wall-clock" time for his time zone before using that code.

export function tzOffset(tz: string, t: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(t / 1000) * 1000;
}

const toWall = (tz: string, t: number) => t + tzOffset(tz, t);

function wallDoses(state: ServerState): DoseRecord[] {
  return state.doses.map((d) => ({ ...d, takenAt: toWall(state.tz, d.takenAt) }));
}

// ---------- Sync from the app ----------

export function applySync(state: ServerState, payload: SyncPayload, now: number): ServerState {
  const firstSync = state.lastSync === 0;
  const known = new Set(state.knownDoseIds);
  const incoming = new Set(payload.doses.map((d) => d.id));
  const next: ServerState = {
    ...state,
    tz: payload.tz || state.tz,
    meds: payload.meds,
    doses: payload.doses,
    settings: payload.settings,
    family: payload.family,
    lastSync: now,
    knownDoseIds: [...incoming],
    // A dose removed before its update went out (e.g. tapped Undo) is never mentioned.
    queue: state.queue.filter((e) => e.kind !== 'taken' || incoming.has(e.doseId)),
    openAlerts: { ...state.openAlerts },
  };

  if (!firstSync) {
    for (const d of payload.doses) {
      // Only recent doses: an old entry added from "Took it earlier" a day late isn't news.
      if (known.has(d.id) || d.takenAt < now - 12 * 60 * MINUTE) continue;
      const afterAlert = !!next.openAlerts[d.medId];
      delete next.openAlerts[d.medId];
      next.queue.push({ kind: 'taken', doseId: d.id, medId: d.medId, at: d.takenAt, afterAlert });
    }
  }
  return startWindow(next, now);
}

function startWindow(state: ServerState, now: number): ServerState {
  if (state.queue.length === 0) return { ...state, sendAt: null };
  if (state.sendAt !== null) return state;
  return { ...state, sendAt: now + state.family.bufferMinutes * MINUTE };
}

// ---------- Every minute ----------

export function tick(state: ServerState, now: number): { state: ServerState; messages: OutgoingMessage[] } {
  if (!state.settings || state.meds.length === 0) return { state, messages: [] };
  let next: ServerState = { ...state, queue: [...state.queue], alerted: { ...state.alerted }, openAlerts: { ...state.openAlerts } };
  const settings = state.settings;
  const wallNow = toWall(state.tz, now);
  const doses = wallDoses(state);
  const messages: OutgoingMessage[] = [];

  // Missed doses: his alarm has been going for a while and nothing's been logged.
  for (const med of state.meds) {
    const st = getStatus(med, doses, wallNow, settings);
    if (st.kind !== 'overdue' || st.dueBy === null) continue;
    const alarmStarted = deferPastQuietHours(st.dueBy, settings);
    if (wallNow < alarmStarted + state.family.lateMinutes * MINUTE) continue;
    if (next.alerted[med.id] === st.dueBy) continue;
    next.alerted[med.id] = st.dueBy;
    next.openAlerts[med.id] = true;
    next.queue.push({ kind: 'missed', medId: med.id, dueBy: st.dueBy });
  }
  next = startWindow(next, now);

  if (next.sendAt !== null && now >= next.sendAt) {
    for (const [chatId, sub] of Object.entries(next.subscribers)) {
      const text = composeUpdate(next, next.queue, sub, now);
      if (text) messages.push({ chatId, text });
    }
    next = { ...next, queue: [], sendAt: null };
  }

  // Nightly summary, a few minutes after his last doses are due.
  const { start, cutoff } = dayBounds(wallNow, settings);
  const dayKey = new Date(start).toISOString().slice(0, 10);
  if (wallNow >= cutoff + 5 * MINUTE && next.lastSummaryDay !== dayKey) {
    const text = composeSummary(next, now);
    for (const [chatId, sub] of Object.entries(next.subscribers)) {
      if (sub.summary) messages.push({ chatId, text });
    }
    next = { ...next, lastSummaryDay: dayKey };
  }

  return { state: next, messages };
}

// ---------- Message text ----------

const medById = (state: ServerState, id: string) => state.meds.find((m) => m.id === id);
const labelOf = (m: Medication) => (m.dose ? `${m.name} (${m.dose})` : m.name);

export function composeUpdate(
  state: ServerState,
  events: QueuedEvent[],
  sub: Subscriber,
  now: number,
): string | null {
  const tz = state.tz;
  const lines: string[] = [];
  const missed = events.filter((e) => e.kind === 'missed');
  const taken = events.filter((e) => e.kind === 'taken');

  for (const e of missed) {
    const med = medById(state, e.medId);
    if (!med) continue;
    // dueBy is already wall-clock time.
    lines.push(`⚠️ ${labelOf(med)} hasn't been taken. It was due by ${formatTime(e.dueBy)}.`);
  }
  for (const e of taken) {
    // Taken updates go to people who want them, or to everyone when it settles an earlier alert.
    if (!sub.taken && !e.afterAlert) continue;
    const med = medById(state, e.medId);
    if (!med) continue;
    const when = formatTime(toWall(tz, e.at));
    lines.push(`✅ ${labelOf(med)} taken at ${when}${e.afterAlert ? ' (after the missed-dose alert)' : ''}`);
  }
  if (lines.length === 0) return null;
  if (missed.length > 0 && now - state.lastSync > 3 * 60 * MINUTE) {
    // If his phone has been offline, doses he took may simply not have arrived yet.
    lines.push('', `(The last update from his phone was at ${formatTime(toWall(tz, state.lastSync))}. It may be switched off or offline.)`);
  }
  const title = missed.length > 0 ? `💊 ${state.family.name}'s medication: needs attention` : `💊 ${state.family.name}'s medication`;
  return [title, '', ...lines].join('\n');
}

export function composeSummary(state: ServerState, now: number): string {
  const settings = state.settings!;
  const wallNow = toWall(state.tz, now);
  const doses = wallDoses(state);
  const { start, nextStart } = dayBounds(wallNow, settings);
  const lines = state.meds.map((med) => {
    const today = doses.filter((d) => d.medId === med.id && d.takenAt >= start && d.takenAt < nextStart);
    if (med.schedule === 'meals') {
      const st = getStatus(med, doses, wallNow, settings);
      const takenKeys = new Set(st.meal?.takenToday.map((t) => t.key) ?? []);
      const parts = MEALS.filter((m) => med.meals.includes(m.key)).map(
        (m) => `${m.label.toLowerCase()} ${takenKeys.has(m.key) ? '✓' : '✗'}`,
      );
      return `${takenKeys.size === med.meals.length ? '✅' : '⚠️'} ${med.name}: ${parts.join(', ')}`;
    }
    const times = today
      .sort((a, b) => a.takenAt - b.takenAt)
      .map((d) => formatTime(d.takenAt))
      .join(', ');
    if (med.dailyTarget !== null) {
      const ok = today.length >= med.dailyTarget;
      return `${ok ? '✅' : '⚠️'} ${med.name}: ${today.length} of ${med.dailyTarget}${times ? ` (${times})` : ''}`;
    }
    return `• ${med.name}: ${today.length === 0 ? 'none taken' : `taken ${today.length}× (${times})`}`;
  });
  return [`🌙 ${state.family.name}'s medication today`, '', ...lines].join('\n');
}

export function composeStatus(state: ServerState, now: number): string {
  if (!state.settings || state.meds.length === 0) return `No medication has been set up on ${state.family.name}'s phone yet.`;
  const wallNow = toWall(state.tz, now);
  const doses = wallDoses(state);
  const lines = state.meds.map((med) => {
    const st = getStatus(med, doses, wallNow, state.settings!);
    const text = describeStatus(med, st, wallNow, state.settings!);
    const icon = { never: '🟢', ready: '🟢', wait: '🟡', overdue: '🔴', done: '🔵' }[st.kind];
    return `${icon} ${med.name}: ${text.headline}`;
  });
  const synced = formatTime(toWall(state.tz, state.lastSync));
  return [`💊 ${state.family.name}'s medication right now`, '', ...lines, '', `Last update from his phone: ${synced}`].join(
    '\n',
  );
}

// ---------- Telegram commands ----------

export const HELP_TEXT = [
  'Commands:',
  '/status – how things stand right now',
  '/updates_on or /updates_off – a message each time a dose is taken',
  '/summary_on or /summary_off – a summary each night',
  '/stop – stop all messages',
].join('\n');

/** Handles a message sent to the bot. Returns the new state and the reply. */
export function handleCommand(
  state: ServerState,
  chatId: string,
  firstName: string,
  text: string,
  joinCode: string,
  now: number,
): { state: ServerState; reply: string } {
  const [command, arg] = text.trim().split(/\s+/, 2);
  const cmd = command.toLowerCase().replace(/@.*$/, '');
  const sub = state.subscribers[chatId];

  if (cmd === '/start') {
    if (sub) return { state, reply: `You're already getting updates about ${state.family.name}.\n\n${HELP_TEXT}` };
    if (arg !== joinCode) {
      return { state, reply: 'This bot is private. Ask the family for an invite link to join.' };
    }
    const subscribers = { ...state.subscribers, [chatId]: { name: firstName, taken: true, summary: true } };
    return {
      state: { ...state, subscribers },
      reply:
        `Hi ${firstName}! You'll now get messages about ${state.family.name}'s medication: ` +
        `when doses are taken, if one is missed, and a summary each night.\n\n${HELP_TEXT}`,
    };
  }

  if (!sub) return { state, reply: 'This bot is private. Ask the family for an invite link to join.' };

  const update = (patch: Partial<Subscriber>, reply: string) => ({
    state: { ...state, subscribers: { ...state.subscribers, [chatId]: { ...sub, ...patch } } },
    reply,
  });
  switch (cmd) {
    case '/status':
      return { state, reply: composeStatus(state, now) };
    case '/updates_on':
      return update({ taken: true }, "OK, you'll get a message each time a dose is taken.");
    case '/updates_off':
      return update({ taken: false }, "OK, no more 'taken' messages. You'll still be told about missed doses.");
    case '/summary_on':
      return update({ summary: true }, "OK, you'll get a summary each night.");
    case '/summary_off':
      return update({ summary: false }, 'OK, no more nightly summaries.');
    case '/stop': {
      const subscribers = { ...state.subscribers };
      delete subscribers[chatId];
      return {
        state: { ...state, subscribers },
        reply: "You won't get any more messages. Use the invite link again to rejoin.",
      };
    }
    default:
      return { state, reply: HELP_TEXT };
  }
}

