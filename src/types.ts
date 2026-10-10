export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'bedtime';

export type Medication = {
  id: string;
  name: string;
  /** Free text, e.g. "2 tablets" or "500mg". */
  dose: string;
  /** 'interval': every few hours. 'meals': roughly at chosen meal times. */
  schedule: 'interval' | 'meals';
  /** Earliest he may take the next dose, in hours after the last one. (interval) */
  minHours: number;
  /** Alarm if no dose has been taken this many hours after the last one. Null = no alarm. (interval) */
  maxHours: number | null;
  /** Max doses in any rolling 24 hours. Null = no limit. (interval) */
  maxPerDay: number | null;
  /** Doses to fit in between waking and the "last doses by" time each day. Null = no daily target. (interval) */
  dailyTarget: number | null;
  /** Which meal times it's taken at. (meals) */
  meals: MealKey[];
  color: string;
  notes: string;
};

export type DoseRecord = {
  id: string;
  medId: string;
  takenAt: number;
};

export type Settings = {
  /** When his day starts, in minutes after midnight. */
  dayStart: number;
  /** All doses should be taken by this time, in minutes after midnight. */
  lastDoseBy: number;
  /** Hold back reminders and alarms between lastDoseBy and dayStart until the morning. */
  quietHoursEnabled: boolean;
  /** Rough time of each meal, in minutes after midnight. */
  mealTimes: Record<MealKey, number>;
  /** Alarm if a meal-time dose hasn't been taken this many minutes after the meal. */
  mealGraceMinutes: number;
  /** How often the overdue alarm repeats until a dose is logged. */
  alarmRepeatMinutes: number;
  /** How many times the overdue alarm repeats after the first one. */
  alarmRepeatCount: number;
};

export type StatusKind =
  /** Never taken and nothing due - fine to take now. */
  | 'never'
  /** Too soon (minimum gap, 24-hour limit, or not yet meal time). */
  | 'wait'
  /** Fine to take. */
  | 'ready'
  /** Past the maximum gap, the latest time to fit today's doses in, or the meal time - take now. */
  | 'overdue'
  /** Today's doses are finished (or no more fit in before the last-doses-by time). */
  | 'done';

export type MedStatus = {
  kind: StatusKind;
  lastTaken: number | null;
  /** When the next dose is allowed (null if allowed now). */
  canTakeAt: number | null;
  /** When the gentle "you can take it now" reminder goes off (null for none). */
  remindAt: number | null;
  /** When the overdue alarm goes off (null for no alarm). */
  dueBy: number | null;
  takenLast24h: number;
  /** True when the wait is caused by the 24-hour limit rather than the minimum gap. */
  limitedByDailyMax: boolean;
  /** Daily target progress, for interval medication with a daily target. */
  today?: {
    taken: number;
    target: number;
    /** Today's "last doses by" time. */
    cutoff: number;
    /** How many more doses can still fit in before the cutoff. */
    fits: number;
  };
  /** The meal the next dose belongs to, for meal-time medication. */
  meal?: {
    key: MealKey;
    time: number;
    takenToday: { key: MealKey; at: number }[];
    missedToday: MealKey[];
  };
};
