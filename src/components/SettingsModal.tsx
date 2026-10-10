import { StyleSheet, Switch, Text, View } from 'react-native';
import { formatClock, MEALS } from '../logic';
import type { Settings } from '../types';
import { Button, colors, Sheet } from './ui';

type Props = {
  visible: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onTestAlarm: () => void;
  onClose: () => void;
};

const wrap = (m: number) => (m + 24 * 60) % (24 * 60);

export function SettingsModal({ visible, settings, onChange, onTestAlarm, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const clockStepper = (label: string, key: 'dayStart' | 'lastDoseBy', step: number) => (
    <Stepper
      label={label}
      value={formatClock(settings[key])}
      onMinus={() => set({ [key]: wrap(settings[key] - step) })}
      onPlus={() => set({ [key]: wrap(settings[key] + step) })}
    />
  );

  return (
    <Sheet visible={visible} title="Settings" onClose={onClose}>
      <View style={styles.card}>
        <Text style={styles.title}>Your day</Text>
        <Text style={styles.hint}>
          Medicines with a number of doses each day are paced so they all fit in between these times.
        </Text>
        {clockStepper('Day starts', 'dayStart', 30)}
        {clockStepper('Last doses by', 'lastDoseBy', 30)}
        <View style={[styles.row, { marginTop: 16 }]}>
          <Text style={[styles.label, { flex: 1, fontWeight: '700' }]}>No alarms overnight</Text>
          <Switch value={settings.quietHoursEnabled} onValueChange={(v) => set({ quietHoursEnabled: v })} />
        </View>
        <Text style={styles.hint}>
          Reminders and alarms due between {formatClock(settings.lastDoseBy)} and {formatClock(settings.dayStart)} wait
          until the morning. Turn this off if any medication must be taken during the night.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Meal times</Text>
        <Text style={styles.hint}>Rough times for medicines taken with meals.</Text>
        {MEALS.map((m) => (
          <Stepper
            key={m.key}
            label={m.label}
            value={formatClock(settings.mealTimes[m.key])}
            onMinus={() => set({ mealTimes: { ...settings.mealTimes, [m.key]: wrap(settings.mealTimes[m.key] - 15) } })}
            onPlus={() => set({ mealTimes: { ...settings.mealTimes, [m.key]: wrap(settings.mealTimes[m.key] + 15) } })}
          />
        ))}
        <Stepper
          label="Alarm if not taken within"
          value={`${settings.mealGraceMinutes} min`}
          onMinus={() => set({ mealGraceMinutes: Math.max(15, settings.mealGraceMinutes - 15) })}
          onPlus={() => set({ mealGraceMinutes: Math.min(180, settings.mealGraceMinutes + 15) })}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Overdue alarm</Text>
        <Text style={styles.hint}>
          Once a dose is overdue the alarm repeats until it is logged as taken, up to the number of times below.
        </Text>
        <Stepper
          label="Repeat every"
          value={`${settings.alarmRepeatMinutes} min`}
          onMinus={() => set({ alarmRepeatMinutes: Math.max(5, settings.alarmRepeatMinutes - 5) })}
          onPlus={() => set({ alarmRepeatMinutes: Math.min(60, settings.alarmRepeatMinutes + 5) })}
        />
        <Stepper
          label="Repeat up to"
          value={`${settings.alarmRepeatCount} times`}
          onMinus={() => set({ alarmRepeatCount: Math.max(0, settings.alarmRepeatCount - 1) })}
          onPlus={() => set({ alarmRepeatCount: Math.min(12, settings.alarmRepeatCount + 1) })}
        />
        <Button title="Test the alarm (in 5 seconds)" kind="secondary" onPress={onTestAlarm} style={{ marginTop: 8 }} />
      </View>
    </Sheet>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.row, { marginTop: 12 }]}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <Button title="−" kind="secondary" onPress={onMinus} style={styles.stepBtn} />
      <Text style={styles.value}>{value}</Text>
      <Button title="+" kind="secondary" onPress={onPlus} style={styles.stepBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { fontSize: 16, color: colors.muted, marginTop: 6 },
  label: { fontSize: 18, color: colors.text },
  value: { fontSize: 18, fontWeight: '700', minWidth: 90, textAlign: 'center', color: colors.text },
  stepBtn: { width: 52, paddingHorizontal: 0 },
});
