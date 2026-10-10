// Only the four weights the app uses, so the other ten aren't bundled.
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_500Medium } from '@expo-google-fonts/atkinson-hyperlegible-next/500Medium';
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold';
import { AtkinsonHyperlegibleNext_800ExtraBold } from '@expo-google-fonts/atkinson-hyperlegible-next/800ExtraBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { familyEnabled, fetchInviteLink, syncToServer } from './src/familySync';
import {
  cardText,
  DEFAULT_SETTINGS,
  doseWarning,
  formatTime,
  getStatus,
  isNightTime,
  newId,
  pruneDoses,
  type CardState,
} from './src/logic';
import { rescheduleAll, scheduleTestAlarm, setupNotifications } from './src/notifications';
import { HistorySheet } from './src/screens/HistorySheet';
import { MedCard } from './src/screens/MedCard';
import { MedFormSheet } from './src/screens/MedFormSheet';
import { CarerSheet, SettingsSheet } from './src/screens/SettingsSheet';
import { TakenEarlierSheet } from './src/screens/TakenEarlierSheet';
import { loadAll, saveDoses, saveMeds, saveSettings } from './src/storage';
import type { DoseRecord, FamilyStatus, Medication, MedStatus, Settings } from './src/types';
import { Button, Card, ConfirmSheet, Hint, SectionHeader, UndoBar, type Confirmation } from './src/ui/components';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { palettes, space, type, type ThemeId } from './src/ui/tokens';

type SheetName = 'settings' | 'carer' | 'history' | 'form' | null;

const UNDO_MS = 30 * 1000;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_700Bold,
    AtkinsonHyperlegibleNext_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      {/* If the font can't load, carry on with the system font rather than showing nothing. */}
      {fontsLoaded || fontError ? <Home /> : <View style={{ flex: 1, backgroundColor: palettes.day.canvas }} />}
    </SafeAreaProvider>
  );
}

function Home() {
  const [loaded, setLoaded] = useState(false);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<DoseRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(Date.now());
  const [notificationsAllowed, setNotificationsAllowed] = useState(true);

  const [sheet, setSheet] = useState<SheetName>(null);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [earlierFor, setEarlierFor] = useState<Medication | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [undo, setUndo] = useState<{ dose: DoseRecord; name: string } | null>(null);
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus | null>(null);

  // Load saved data and ask for notification permission on start-up.
  useEffect(() => {
    (async () => {
      const data = await loadAll();
      setMeds(data.meds);
      setDoses(pruneDoses(data.doses, Date.now()));
      setSettings(data.settings);
      setLoaded(true);
      setNotificationsAllowed(await setupNotifications().catch(() => false));
    })();
  }, []);

  // Keep the clock and countdowns up to date.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Rescheduling is async; chain the calls so two never interleave.
  const scheduling = useRef(Promise.resolve());
  const latest = useRef({ meds, doses, settings });
  latest.current = { meds, doses, settings };
  const reschedule = useCallback(() => {
    scheduling.current = scheduling.current
      .then(() => rescheduleAll(latest.current.meds, latest.current.doses, latest.current.settings))
      .catch((e) => console.warn('Failed to schedule notifications', e));
  }, []);

  // Family alerts: send the latest data to the server, in order.
  const syncing = useRef(Promise.resolve());
  const syncFamily = useCallback(() => {
    const { meds, doses, settings } = latest.current;
    if (!familyEnabled(settings.family)) {
      setFamilyStatus(null);
      return syncing.current;
    }
    syncing.current = syncing.current.then(() =>
      syncToServer(meds, doses, settings)
        .then((r) => setFamilyStatus({ ok: true, at: Date.now(), subscribers: r.subscribers }))
        .catch((e: Error) => setFamilyStatus({ ok: false, at: Date.now(), error: e.message })),
    );
    return syncing.current;
  }, []);

  // Save, reschedule and update the family server whenever anything changes.
  useEffect(() => {
    if (!loaded) return;
    saveMeds(meds);
    saveDoses(doses);
    saveSettings(settings);
    reschedule();
    syncFamily();
  }, [loaded, meds, doses, settings, reschedule, syncFamily]);

  // If the last family update didn't get through (e.g. no signal), keep trying while the app is open.
  useEffect(() => {
    if (!familyStatus || familyStatus.ok) return;
    const timer = setTimeout(syncFamily, 2 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [familyStatus, syncFamily]);

  // When the app comes back to the front, refresh the clock, the schedule and the family server.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        if (loaded) {
          reschedule();
          syncFamily();
        }
      }
    });
    return () => sub.remove();
  }, [loaded, reschedule, syncFamily]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const logDose = (med: Medication, takenAt: number) => {
    const record = () => {
      const dose: DoseRecord = { id: newId(), medId: med.id, takenAt };
      setDoses((prev) => [...prev, dose]);
      setUndo({ dose, name: med.name });
      setEarlierFor(null);
      setNow(Date.now());
    };
    const warning = doseWarning(med, doses, takenAt, settings);
    if (!warning) return record();
    setEarlierFor(null);
    setConfirmation({
      title: warning.title,
      message: warning.message,
      tone: 'caution',
      cancelLabel: "Don't log it",
      confirmLabel: 'I already took it, log it',
      onConfirm: record,
    });
  };

  const saveMed = (med: Medication) => {
    setMeds((prev) => (prev.some((m) => m.id === med.id) ? prev.map((m) => (m.id === med.id ? med : m)) : [...prev, med]));
    setSheet('carer');
  };

  const removeMed = (med: Medication) =>
    setConfirmation({
      title: `Remove ${med.name}?`,
      message: 'It will no longer appear or send reminders. Past doses stay in the history.',
      tone: 'danger',
      cancelLabel: 'Keep it',
      confirmLabel: 'Remove this medicine',
      onConfirm: () => {
        setMeds((prev) => prev.filter((m) => m.id !== med.id));
        setSheet('carer');
      },
    });

  const removeDose = (dose: DoseRecord, name: string) =>
    setConfirmation({
      title: 'Remove this entry?',
      message: `${name} at ${formatTime(dose.takenAt)}. Only remove it if it was logged by mistake.`,
      tone: 'danger',
      cancelLabel: 'Keep it',
      confirmLabel: 'Remove this entry',
      onConfirm: () => setDoses((prev) => prev.filter((d) => d.id !== dose.id)),
    });

  const themeId: ThemeId =
    settings.appearance === 'auto' ? (isNightTime(now, settings) ? 'night' : 'day') : settings.appearance;

  if (!loaded) return <View style={{ flex: 1, backgroundColor: palettes[themeId].canvas }} />;

  return (
    <ThemeProvider id={themeId}>
      <Today
        meds={meds}
        doses={doses}
        settings={settings}
        now={now}
        notificationsAllowed={notificationsAllowed}
        onTake={(m) => logDose(m, Date.now())}
        onTakeEarlier={(m) => {
          setNow(Date.now());
          setEarlierFor(m);
        }}
        onOpenSettings={() => setSheet('settings')}
        onOpenCarer={() => setSheet('carer')}
        onOpenHistory={() => setSheet('history')}
      />

      {undo && (
        <View style={{ position: 'absolute', left: space[4], right: space[4], bottom: space[6] }}>
          <UndoBar
            message={`${undo.name} logged at ${formatTime(undo.dose.takenAt)}`}
            onUndo={() => {
              setDoses((prev) => prev.filter((d) => d.id !== undo.dose.id));
              setUndo(null);
            }}
          />
        </View>
      )}

      <TakenEarlierSheet med={earlierFor} now={now} onPick={logDose} onClose={() => setEarlierFor(null)} />
      <HistorySheet visible={sheet === 'history'} meds={meds} doses={doses} now={now} onRemove={removeDose} onClose={() => setSheet(null)} />
      <SettingsSheet
        visible={sheet === 'settings'}
        settings={settings}
        onChange={setSettings}
        onOpenCarer={() => setSheet('carer')}
        onTestAlarm={() => {
          scheduleTestAlarm()
            .then(() => Alert.alert('Test alarm set', 'It will go off in 5 seconds. Try locking the phone.'))
            .catch(() => Alert.alert('Could not set the test alarm', 'Check notifications are allowed for this app.'));
        }}
        onClose={() => setSheet(null)}
      />
      <CarerSheet
        visible={sheet === 'carer'}
        meds={meds}
        settings={settings}
        onChange={setSettings}
        onEditMed={(m) => {
          setEditing(m);
          setSheet('form');
        }}
        onAddMed={() => {
          setEditing(null);
          setSheet('form');
        }}
        familyStatus={familyStatus}
        onFamilyTest={syncFamily}
        onShareInvite={() => {
          fetchInviteLink(settings.family)
            .then((link) =>
              Share.share({ message: `Tap this link to get Telegram updates about ${settings.family.name}'s medication: ${link}` }),
            )
            .catch((e: Error) => Alert.alert('Could not get the invite link', e.message));
        }}
        onClose={() => setSheet(null)}
      />
      <MedFormSheet visible={sheet === 'form'} med={editing} settings={settings} onSave={saveMed} onRemove={removeMed} onClose={() => setSheet('carer')} />
      <ConfirmSheet confirmation={confirmation} onClose={() => setConfirmation(null)} />
    </ThemeProvider>
  );
}

// ---------- The Today screen ----------

const SECTIONS: { title: string; states: CardState[] }[] = [
  { title: 'Take now', states: ['overdue', 'due'] },
  { title: 'Later today', states: ['wait'] },
  { title: 'If needed', states: ['asNeeded'] },
  { title: 'Done for today', states: ['done'] },
];

const STATE_ORDER: CardState[] = ['overdue', 'due', 'wait', 'asNeeded', 'done'];

/** Most urgent first: overdue, then by the time each one is due or allowed. */
function sortKey(st: MedStatus): number {
  return st.kind === 'wait' ? (st.canTakeAt ?? Infinity) : (st.dueBy ?? Infinity);
}

function Today({
  meds,
  doses,
  settings,
  now,
  notificationsAllowed,
  onTake,
  onTakeEarlier,
  onOpenSettings,
  onOpenCarer,
  onOpenHistory,
}: {
  meds: Medication[];
  doses: DoseRecord[];
  settings: Settings;
  now: number;
  notificationsAllowed: boolean;
  onTake: (m: Medication) => void;
  onTakeEarlier: (m: Medication) => void;
  onOpenSettings: () => void;
  onOpenCarer: () => void;
  onOpenHistory: () => void;
}) {
  const { c, id } = useTheme();
  const items = meds
    .map((med) => {
      const status = getStatus(med, doses, now, settings);
      return { med, status, state: cardText(med, status, now, settings).state };
    })
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || sortKey(a.status) - sortKey(b.status));

  const date = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <StatusBar style={id === 'night' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 140 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[4], flexWrap: 'wrap' }}>
          <View style={{ flexShrink: 1 }}>
            <Text accessibilityRole="header" style={[type.clock, { color: c.ink }]}>
              {formatTime(now)}
            </Text>
            <Text style={[type.body, { color: c.inkMuted }]}>{date}</Text>
          </View>
          <Button title="Settings" icon="gear" variant="secondary" block={false} onPress={onOpenSettings} />
        </View>

        {!notificationsAllowed && (
          <Card style={{ marginTop: space[5], backgroundColor: c.statusOverdueTint, borderColor: c.statusOverdue }}>
            <Text style={[type.bodyStrong, { color: c.statusOverdue }]}>
              Notifications are turned off, so reminders and alarms won&apos;t work.
            </Text>
            <Button title="Open phone settings" variant="secondary" onPress={() => Linking.openSettings()} />
          </Card>
        )}

        {meds.length === 0 && (
          <Card style={{ marginTop: space[6] }}>
            <Text style={[type.status, { color: c.ink }]}>No medicines yet</Text>
            <Text style={[type.body, { color: c.inkMuted }]}>
              Add each medicine with its timings. The app shows when it&apos;s OK to take the next dose and sounds an alarm if one is missed.
            </Text>
            <Button title="Add a medicine" icon="plus" onPress={onOpenCarer} />
          </Card>
        )}

        {SECTIONS.map((section) => {
          const inSection = items.filter((i) => section.states.includes(i.state));
          if (inSection.length === 0) return null;
          return (
            <View key={section.title}>
              <SectionHeader title={section.title} count={inSection.length} />
              <View style={{ gap: space[5] }}>
                {inSection.map(({ med, status }) => (
                  <MedCard
                    key={med.id}
                    med={med}
                    status={status}
                    now={now}
                    settings={settings}
                    onTake={() => onTake(med)}
                    onTakeEarlier={() => onTakeEarlier(med)}
                  />
                ))}
              </View>
            </View>
          );
        })}

        {meds.length > 0 && (
          <View style={{ marginTop: space[6], gap: space[2] }}>
            <Button title="History" icon="history" variant="secondary" onPress={onOpenHistory} />
            <Hint>Everything logged in the last 7 days.</Hint>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
