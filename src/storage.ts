import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, normalizeMedication } from './logic';
import type { DoseRecord, Medication, Settings } from './types';

const KEYS = {
  meds: 'medtracker:meds:v1',
  doses: 'medtracker:doses:v1',
  settings: 'medtracker:settings:v1',
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export type StoredData = { meds: Medication[]; doses: DoseRecord[]; settings: Settings };

export async function loadAll(): Promise<StoredData> {
  const [meds, doses, settings] = await Promise.all([
    read<Medication[]>(KEYS.meds, []),
    read<DoseRecord[]>(KEYS.doses, []),
    read<Partial<Settings>>(KEYS.settings, {}),
  ]);
  return {
    meds: meds.map(normalizeMedication),
    doses,
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      mealTimes: { ...DEFAULT_SETTINGS.mealTimes, ...settings.mealTimes },
    },
  };
}

export const saveMeds = (meds: Medication[]) => AsyncStorage.setItem(KEYS.meds, JSON.stringify(meds));
export const saveDoses = (doses: DoseRecord[]) => AsyncStorage.setItem(KEYS.doses, JSON.stringify(doses));
export const saveSettings = (settings: Settings) =>
  AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
