export type Medication = {
  id: string;
  name: string;
  /** Free text, e.g. "2 tablets" or "500mg". */
  dose: string;
  /** Earliest he may take the next dose, in hours after the last one. */
  minHours: number;
  /** Alarm if no dose has been taken this many hours after the last one. Null = no alarm (as-needed). */
  maxHours: number | null;
  /** Max doses in any rolling 24 hours. Null = no daily limit. */
  maxPerDay: number | null;
  color: string;
  notes: string;
};

export type DoseRecord = {
  id: string;
  medId: string;
  takenAt: number;
};

export type Settings = {
  /** Hold back reminders and alarms overnight and deliver them at quietEnd instead. */
  quietHoursEnabled: boolean;
  /** Minutes after midnight. */
  quietStart: number;
  quietEnd: number;
  /** How often the overdue alarm repeats until a dose is logged. */
  alarmRepeatMinutes: number;
  /** How many times the overdue alarm repeats after the first one. */
  alarmRepeatCount: number;
};

export type StatusKind =
  /** Never taken - fine to take now. */
  | 'never'
  /** Too soon since the last dose (or daily limit reached). */
  | 'wait'
  /** Past the minimum gap - fine to take. */
  | 'ready'
  /** Past the maximum gap - should take now. */
  | 'overdue';

export type MedStatus = {
  kind: StatusKind;
  lastTaken: number | null;
  /** When the next dose is allowed (null if allowed now). */
  canTakeAt: number | null;
  /** When the overdue alarm goes off (null if no maximum or never taken). */
  dueBy: number | null;
  takenLast24h: number;
  /** True when the wait is caused by the 24-hour limit rather than the minimum gap. */
  limitedByDailyMax: boolean;
};
