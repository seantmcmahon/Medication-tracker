import type { DoseRecord, FamilySettings, Medication, Settings } from './types';
import { DAY } from './logic';

export const familyEnabled = (f: FamilySettings) => f.serverUrl.trim() !== '' && f.key.trim() !== '';

const base = (f: FamilySettings) => f.serverUrl.trim().replace(/\/+$/, '');
const auth = (f: FamilySettings) => ({ authorization: `Bearer ${f.key.trim()}` });

async function check(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('The key is wrong. Check it matches APP_KEY in GitHub.');
  if (!res.ok) throw new Error(body.error ?? `The server replied with error ${res.status}.`);
  return body;
}

/** Sends the medication list and the last week of doses to the family alerts server. */
export async function syncToServer(
  meds: Medication[],
  doses: DoseRecord[],
  settings: Settings,
): Promise<{ subscribers: number }> {
  const f = settings.family;
  // The server address and key stay on the phone.
  const { family: _family, appearance: _appearance, ...timing } = settings;
  const res = await fetch(`${base(f)}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth(f) },
    body: JSON.stringify({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      meds,
      doses: doses.filter((d) => d.takenAt > Date.now() - 7 * DAY),
      settings: timing,
      family: { name: f.name, bufferMinutes: f.bufferMinutes, lateMinutes: f.lateMinutes },
    }),
  });
  return check(res);
}

/** The Telegram link family members tap to join. */
export async function fetchInviteLink(f: FamilySettings): Promise<string> {
  const res = await fetch(`${base(f)}/invite`, { headers: auth(f) });
  return (await check(res)).link;
}
