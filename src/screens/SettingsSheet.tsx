import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { familyEnabled } from '../familySync';
import { formatClock, formatTime, MEALS } from '../logic';
import type { Appearance, FamilySettings, FamilyStatus, Medication, Settings } from '../types';
import { Button, Card, CarerGate, ChoiceList, Field, Heading, Hint, Icon, PillIcon, Sheet, Stepper } from '../ui/components';
import { useTheme } from '../ui/theme';
import { radius, size, space, type } from '../ui/tokens';

const wrap = (m: number) => (m + 24 * 60) % (24 * 60);

// ---------- Everyday settings: what the person taking the medicine may want to change ----------

export function SettingsSheet({
  visible,
  settings,
  onChange,
  onTestAlarm,
  onOpenCarer,
  onClose,
}: {
  visible: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onTestAlarm: () => void;
  onOpenCarer: () => void;
  onClose: () => void;
}) {
  const appearances: { key: Appearance; label: string; detail: string }[] = [
    { key: 'auto', label: 'Automatic', detail: `Day, then Night after ${formatClock(settings.lastDoseBy)}` },
    { key: 'day', label: 'Day', detail: 'Light, all the time' },
    { key: 'night', label: 'Night', detail: 'Dim, all the time' },
    { key: 'contrast', label: 'High contrast', detail: 'Black on white with thick borders' },
  ];
  return (
    <Sheet visible={visible} title="Settings" onClose={onClose}>
      <Card>
        <Heading>How the app looks</Heading>
        <ChoiceList
          label="How the app looks"
          options={appearances.map((a) => ({ ...a, selected: settings.appearance === a.key }))}
          onSelect={(k) => onChange({ ...settings, appearance: k as Appearance })}
        />
        <Hint>Text also gets bigger with the phone&apos;s own text size setting.</Hint>
      </Card>

      <Card>
        <Heading>Alarm</Heading>
        <Hint>Check the alarm is loud enough. It goes off 5 seconds after you tap, so you can lock the phone first.</Hint>
        <Button title="Test the alarm" icon="bell" variant="secondary" onPress={onTestAlarm} />
      </Card>

      <View style={{ marginTop: space[6], gap: space[2] }}>
        <CarerGate onOpen={onOpenCarer} />
        <Hint>For adding medicines and changing times. Press and hold for a moment to open.</Hint>
      </View>
    </Sheet>
  );
}

// ---------- Carer settings: medicines, timings, alarms and family alerts ----------

const WARNING_PRESETS: number[][] = [[], [15], [30, 15], [60, 30, 15]];
const warningLabel = (w: number[]) => (w.length === 0 ? 'Off' : `${[...w].sort((a, b) => b - a).join(', ')} min before`);
function stepWarnings(current: number[], dir: number): number[] {
  const key = [...current].sort((a, b) => b - a).join(',');
  const i = WARNING_PRESETS.findIndex((p) => p.join(',') === key);
  const next = Math.min(WARNING_PRESETS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir));
  return WARNING_PRESETS[next];
}

export function CarerSheet({
  visible,
  meds,
  settings,
  onChange,
  onEditMed,
  onAddMed,
  familyStatus,
  onFamilyTest,
  onShareInvite,
  onClose,
}: {
  visible: boolean;
  meds: Medication[];
  settings: Settings;
  onChange: (s: Settings) => void;
  onEditMed: (med: Medication) => void;
  onAddMed: () => void;
  familyStatus: FamilyStatus | null;
  onFamilyTest: () => void;
  onShareInvite: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const clockStepper = (label: string, key: 'dayStart' | 'lastDoseBy') => (
    <Stepper
      label={label}
      value={formatClock(settings[key])}
      onMinus={() => set({ [key]: wrap(settings[key] - 30) })}
      onPlus={() => set({ [key]: wrap(settings[key] + 30) })}
    />
  );

  return (
    <Sheet visible={visible} title="Carer settings" onClose={onClose}>
      <Card>
        <Heading>Medicines</Heading>
        {meds.length === 0 && <Hint>No medicines yet. Add each one with its timings.</Hint>}
        <View style={{ gap: space[2] }}>
          {meds.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityHint="Opens this medicine to edit it"
              onPress={() => onEditMed(m)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: size.targetPrimary,
                padding: space[3],
                borderRadius: radius.md,
                borderWidth: size.borderControl,
                borderColor: c.lineStrong,
                backgroundColor: pressed ? c.sunken : c.surface,
              })}
            >
              <PillIcon pill={m.pill} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: c.ink }]}>{m.name}</Text>
                {!!m.dose && <Text style={[type.hint, { color: c.inkMuted }]}>{m.dose}</Text>}
              </View>
              <Text style={[type.label, { color: c.action }]}>Edit</Text>
              <Icon name="chevron" color={c.action} size={24} />
            </Pressable>
          ))}
        </View>
        <Button title="Add a medicine" icon="plus" variant={meds.length === 0 ? 'primary' : 'secondary'} onPress={onAddMed} />
      </Card>

      <Card>
        <Heading>Your day</Heading>
        <Hint>Medicines with a number of doses each day are paced so they all fit in between these times.</Hint>
        {clockStepper('Day starts', 'dayStart')}
        {clockStepper('Last doses by', 'lastDoseBy')}
        <Text style={[type.label, { color: c.ink, marginTop: space[2] }]}>Overnight</Text>
        <ChoiceList
          label="Overnight"
          options={[
            {
              key: 'quiet',
              label: 'No alarms overnight',
              detail: `Anything due between ${formatClock(settings.lastDoseBy)} and ${formatClock(settings.dayStart)} waits until morning`,
              selected: settings.quietHoursEnabled,
            },
            { key: 'allow', label: 'Alarms at any time', detail: 'For medicine that must be taken during the night', selected: !settings.quietHoursEnabled },
          ]}
          onSelect={(k) => set({ quietHoursEnabled: k === 'quiet' })}
        />
      </Card>

      <Card>
        <Heading>Meal times</Heading>
        <Hint>Rough times for medicines taken with meals.</Hint>
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
      </Card>

      <Card>
        <Heading>Reminders and alarm</Heading>
        <Stepper
          label="Warn before the alarm"
          value={warningLabel(settings.warnBeforeMinutes)}
          onMinus={() => set({ warnBeforeMinutes: stepWarnings(settings.warnBeforeMinutes, -1) })}
          onPlus={() => set({ warnBeforeMinutes: stepWarnings(settings.warnBeforeMinutes, 1) })}
        />
        <Hint>Gentle reminders, so there&apos;s time to take it before the alarm goes off.</Hint>
        <Stepper
          label="Repeat the alarm every"
          value={`${settings.alarmRepeatMinutes} min`}
          onMinus={() => set({ alarmRepeatMinutes: Math.max(5, settings.alarmRepeatMinutes - 5) })}
          onPlus={() => set({ alarmRepeatMinutes: Math.min(60, settings.alarmRepeatMinutes + 5) })}
        />
        <Stepper
          label="Repeat it up to"
          value={`${settings.alarmRepeatCount} times`}
          onMinus={() => set({ alarmRepeatCount: Math.max(0, settings.alarmRepeatCount - 1) })}
          onPlus={() => set({ alarmRepeatCount: Math.min(12, settings.alarmRepeatCount + 1) })}
        />
        <Hint>The alarm stops as soon as a dose is logged.</Hint>
      </Card>

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
  const { c } = useTheme();
  // Typed into local state and saved with the button, so the server isn't contacted on every keystroke.
  const [serverUrl, setServerUrl] = useState(family.serverUrl);
  const [key, setKey] = useState(family.key);
  const [name, setName] = useState(family.name);
  const set = (patch: Partial<FamilySettings>) => onChange({ ...family, ...patch });
  const enabled = familyEnabled(family);

  return (
    <Card>
      <Heading>Family alerts on Telegram</Heading>
      <Hint>Tells family members when doses are taken or missed. Updates close together are sent as one message.</Hint>
      <Field
        label="Server address"
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="https://…workers.dev"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Field label="Key" value={key} onChangeText={setKey} placeholder="The APP_KEY you chose" autoCapitalize="none" autoCorrect={false} secureTextEntry />
      <Field label="Name in messages" hint='For example "Dad"' value={name} onChangeText={setName} />
      <Button
        title={enabled ? 'Save and test' : 'Connect'}
        onPress={() => {
          const next = { ...family, serverUrl: serverUrl.trim(), key: key.trim(), name: name.trim() || 'Dad' };
          // Saving triggers an update to the server; pressing again with nothing changed re-tests it.
          if (next.serverUrl === family.serverUrl && next.key === family.key && next.name === family.name) onTest();
          else onChange(next);
        }}
      />

      {status && (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
          <Icon name={status.ok ? 'check' : 'warning'} color={status.ok ? c.statusDone : c.danger} size={24} />
          <Text style={[type.label, { color: status.ok ? c.statusDone : c.danger, flex: 1 }]}>
            {status.ok
              ? `Connected at ${formatTime(status.at)}. ${status.subscribers ?? 0} family member${status.subscribers === 1 ? '' : 's'} signed up.`
              : `Couldn't reach the server at ${formatTime(status.at)}: ${status.error} It will keep trying.`}
          </Text>
        </View>
      )}

      {enabled && (
        <>
          <Button title="Share the invite link" variant="secondary" onPress={onShareInvite} />
          <Hint>Send it to family members. Tapping it opens Telegram and signs them up.</Hint>
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
          <Hint>Counted from when the overdue alarm starts, so there&apos;s a chance to take it first.</Hint>
        </>
      )}
    </Card>
  );
}
