import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { familyEnabled } from '../familySync';
import { formatClock, formatTime, MEALS } from '../logic';
import type { FamilySettings, FamilyStatus, Settings } from '../types';
import { Button, colors, Sheet } from './ui';

type Props = {
  visible: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  familyStatus: FamilyStatus | null;
  onFamilyTest: () => void;
  onShareInvite: () => void;
  onTestAlarm: () => void;
  onClose: () => void;
};

const wrap = (m: number) => (m + 24 * 60) % (24 * 60);

// Choices for "Warn before the alarm", from none to three warnings.
const WARNING_PRESETS: number[][] = [[], [15], [30, 15], [60, 30, 15]];
const warningLabel = (w: number[]) => (w.length === 0 ? 'Off' : `${[...w].sort((a, b) => b - a).join(', ')} min`);
function stepWarnings(current: number[], dir: number): number[] {
  const key = [...current].sort((a, b) => b - a).join(',');
  const i = WARNING_PRESETS.findIndex((p) => p.join(',') === key);
  const next = Math.min(WARNING_PRESETS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir));
  return WARNING_PRESETS[next];
}

export function SettingsModal({
  visible,
  settings,
  onChange,
  familyStatus,
  onFamilyTest,
  onShareInvite,
  onTestAlarm,
  onClose,
}: Props) {
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
        <Stepper
          label="Warn before the alarm"
          value={warningLabel(settings.warnBeforeMinutes)}
          onMinus={() => set({ warnBeforeMinutes: stepWarnings(settings.warnBeforeMinutes, -1) })}
          onPlus={() => set({ warnBeforeMinutes: stepWarnings(settings.warnBeforeMinutes, 1) })}
        />
        <Text style={styles.hint}>
          {"Gentle reminders before the alarm, so there's time to take it before the alarm goes off."}
        </Text>
        <Button title="Test the alarm (in 5 seconds)" kind="secondary" onPress={onTestAlarm} style={{ marginTop: 8 }} />
      </View>

      <FamilyCard
        family={settings.family}
        status={familyStatus}
        onChange={(family) => set({ family })}
        onTest={onFamilyTest}
        onShareInvite={onShareInvite}
      />
    </Sheet>
  );
}

/** Telegram updates for the family. The server is set up from GitHub; see the README. */
function FamilyCard({
  family,
  status,
  onChange,
  onTest,
  onShareInvite,
}: {
  family: FamilySettings;
  status: FamilyStatus | null;
  onChange: (f: FamilySettings) => void;
  onTest: () => void;
  onShareInvite: () => void;
}) {
  // Typed into local state and saved with the button, so the server isn't contacted on every keystroke.
  const [serverUrl, setServerUrl] = useState(family.serverUrl);
  const [key, setKey] = useState(family.key);
  const [name, setName] = useState(family.name);
  const set = (patch: Partial<FamilySettings>) => onChange({ ...family, ...patch });
  const enabled = familyEnabled(family);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Family alerts (Telegram)</Text>
      <Text style={styles.hint}>
        Tells family members on Telegram when doses are taken or missed. Updates close together are sent as one
        message.
      </Text>

      <Text style={[styles.label, styles.fieldLabel]}>Server address</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="https://…workers.dev"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={[styles.label, styles.fieldLabel]}>Key</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="The APP_KEY you chose"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={[styles.label, styles.fieldLabel]}>His name in messages</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Dad" />
      <Button
        title={enabled ? 'Save and test' : 'Connect'}
        onPress={() => {
          const next = { ...family, serverUrl: serverUrl.trim(), key: key.trim(), name: name.trim() || 'Dad' };
          // Saving triggers an update to the server; pressing again with nothing changed re-tests it.
          if (next.serverUrl === family.serverUrl && next.key === family.key && next.name === family.name) onTest();
          else onChange(next);
        }}
        style={{ marginTop: 12 }}
      />

      {status && (
        <Text style={[styles.status, { color: status.ok ? '#1B6E2A' : colors.danger }]}>
          {status.ok
            ? `✓ Connected at ${formatTime(status.at)}. ${status.subscribers ?? 0} family member${status.subscribers === 1 ? '' : 's'} signed up.`
            : `✗ Couldn't reach the server at ${formatTime(status.at)}: ${status.error} It will keep trying.`}
        </Text>
      )}

      {enabled && (
        <>
          <Button title="Share the invite link" kind="secondary" onPress={onShareInvite} style={{ marginTop: 12 }} />
          <Text style={styles.hint}>
            Send it to family members. Tapping it opens Telegram and signs them up.
          </Text>
          <Stepper
            label="Group updates over"
            value={family.bufferMinutes === 0 ? 'Off' : `${family.bufferMinutes} min`}
            onMinus={() => set({ bufferMinutes: Math.max(0, family.bufferMinutes - 5) })}
            onPlus={() => set({ bufferMinutes: Math.min(30, family.bufferMinutes + 5) })}
          />
          <Stepper
            label="Tell them a dose is missed after"
            value={`${family.lateMinutes} min`}
            onMinus={() => set({ lateMinutes: Math.max(0, family.lateMinutes - 15) })}
            onPlus={() => set({ lateMinutes: Math.min(180, family.lateMinutes + 15) })}
          />
          <Text style={styles.hint}>
            Counted from when his overdue alarm starts, so he has a chance to take it first.
          </Text>
        </>
      )}
    </View>
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
  fieldLabel: { fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    color: colors.text,
  },
  status: { fontSize: 16, marginTop: 10, fontWeight: '600' },
});
