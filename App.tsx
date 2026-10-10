import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HistoryModal } from './src/components/HistoryModal';
import { MedCard } from './src/components/MedCard';
import { MedFormModal } from './src/components/MedFormModal';
import { SettingsModal } from './src/components/SettingsModal';
import { TakenEarlierModal } from './src/components/TakenEarlierModal';
import { Button, colors } from './src/components/ui';
import { DEFAULT_SETTINGS, doseWarning, formatTime, getStatus, newId, pruneDoses } from './src/logic';
import { rescheduleAll, scheduleTestAlarm, setupNotifications } from './src/notifications';
import { loadAll, saveDoses, saveMeds, saveSettings } from './src/storage';
import type { DoseRecord, Medication, Settings } from './src/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <Home />
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

  const [editing, setEditing] = useState<Medication | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [earlierFor, setEarlierFor] = useState<Medication | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undo, setUndo] = useState<{ dose: DoseRecord; name: string } | null>(null);

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

  // Keep the countdowns on screen up to date.
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

  // Save and reschedule whenever anything changes.
  useEffect(() => {
    if (!loaded) return;
    saveMeds(meds);
    saveDoses(doses);
    saveSettings(settings);
    reschedule();
  }, [loaded, meds, doses, settings, reschedule]);

  // When the app comes back to the front, refresh the clock and the schedule.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        if (loaded) reschedule();
      }
    });
    return () => sub.remove();
  }, [loaded, reschedule]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 15 * 1000);
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
    if (warning) {
      Alert.alert(warning.title, warning.message, [
        { text: "Don't log it", style: 'cancel' },
        { text: 'I already took it - log it', style: 'destructive', onPress: record },
      ]);
      return;
    }
    record();
  };

  const saveMed = (med: Medication) => {
    setMeds((prev) => (prev.some((m) => m.id === med.id) ? prev.map((m) => (m.id === med.id ? med : m)) : [...prev, med]));
    setFormOpen(false);
  };

  const deleteMed = (med: Medication) => {
    setMeds((prev) => prev.filter((m) => m.id !== med.id));
    setFormOpen(false);
  };

  const openForm = (med: Medication | null) => {
    setEditing(med);
    setFormOpen(true);
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Medication</Text>
          <Text style={styles.clock}>Now: {formatTime(now)}</Text>
        </View>
        <Button title="Settings" kind="link" onPress={() => setSettingsOpen(true)} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {!notificationsAllowed && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Notifications are turned off, so reminders and alarms won't work. Please allow notifications for this app.
            </Text>
            <Button title="Open phone settings" kind="secondary" onPress={() => Linking.openSettings()} />
          </View>
        )}

        {meds.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No medication yet</Text>
            <Text style={styles.emptyText}>
              Add each tablet with the minimum and maximum time between doses. The app will tell you when it's OK to
              take the next one, and sound an alarm if one is missed.
            </Text>
          </View>
        )}

        {meds.map((med) => (
          <MedCard
            key={med.id}
            med={med}
            now={now}
            status={getStatus(med, doses, now, settings)}
            onTake={() => logDose(med, Date.now())}
            onTakeEarlier={() => {
              setNow(Date.now());
              setEarlierFor(med);
            }}
            onEdit={() => openForm(med)}
          />
        ))}

        <Button title="+ Add medication" kind="secondary" onPress={() => openForm(null)} style={{ marginBottom: 12 }} />
        <Button title="History" kind="secondary" onPress={() => setHistoryOpen(true)} />
      </ScrollView>

      {undo && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>
            Logged {undo.name} at {formatTime(undo.dose.takenAt)}
          </Text>
          <Button
            title="Undo"
            kind="link"
            textColor="#90CAF9"
            style={{ marginLeft: 8 }}
            onPress={() => {
              setDoses((prev) => prev.filter((d) => d.id !== undo.dose.id));
              setUndo(null);
            }}
          />
        </View>
      )}

      <MedFormModal
        visible={formOpen}
        med={editing}
        usedColors={meds.map((m) => m.color)}
        settings={settings}
        onSave={saveMed}
        onDelete={deleteMed}
        onClose={() => setFormOpen(false)}
      />
      <TakenEarlierModal med={earlierFor} now={now} onPick={logDose} onClose={() => setEarlierFor(null)} />
      <HistoryModal
        visible={historyOpen}
        meds={meds}
        doses={doses}
        now={now}
        onDelete={(dose) => setDoses((prev) => prev.filter((d) => d.id !== dose.id))}
        onClose={() => setHistoryOpen(false)}
      />
      <SettingsModal
        visible={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onTestAlarm={() => {
          scheduleTestAlarm()
            .then(() => Alert.alert('Test alarm set', 'It will go off in 5 seconds. Try locking the phone.'))
            .catch(() => Alert.alert('Could not set the test alarm', 'Check notifications are allowed.'));
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 30, fontWeight: '800', color: colors.text },
  clock: { fontSize: 18, color: colors.muted },
  list: { padding: 16, paddingBottom: 96 },
  warning: { backgroundColor: '#FDE3E3', borderRadius: 12, padding: 14, marginBottom: 16, gap: 10 },
  warningText: { fontSize: 17, color: colors.danger, fontWeight: '600' },
  empty: { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 18, color: colors.muted, lineHeight: 26 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: '#263238',
    borderRadius: 12,
    paddingVertical: 8,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toastText: { color: '#fff', fontSize: 17, flex: 1 },
});
