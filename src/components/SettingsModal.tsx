import { StyleSheet, Switch, Text, View } from 'react-native';
import { formatClock } from '../logic';
import type { Settings } from '../types';
import { Button, colors, Sheet } from './ui';

type Props = {
  visible: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onTestAlarm: () => void;
  onClose: () => void;
};

const STEP = 30;
const wrap = (m: number) => (m + 24 * 60) % (24 * 60);

export function SettingsModal({ visible, settings, onChange, onTestAlarm, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <Sheet visible={visible} title="Settings" onClose={onClose}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={[styles.title, { flex: 1 }]}>Quiet hours overnight</Text>
          <Switch value={settings.quietHoursEnabled} onValueChange={(v) => set({ quietHoursEnabled: v })} />
        </View>
        <Text style={styles.hint}>
          Reminders and alarms that would go off during quiet hours wait until the end of quiet hours instead. Leave
          this off if any medication must be taken during the night.
        </Text>
        {settings.quietHoursEnabled && (
          <>
            <Stepper
              label="Quiet from"
              value={formatClock(settings.quietStart)}
              onMinus={() => set({ quietStart: wrap(settings.quietStart - STEP) })}
              onPlus={() => set({ quietStart: wrap(settings.quietStart + STEP) })}
            />
            <Stepper
              label="Until"
              value={formatClock(settings.quietEnd)}
              onMinus={() => set({ quietEnd: wrap(settings.quietEnd - STEP) })}
              onPlus={() => set({ quietEnd: wrap(settings.quietEnd + STEP) })}
            />
          </>
        )}
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
