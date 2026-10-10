import { Pressable, Text, View } from 'react-native';
import { DAY, formatDayTime } from '../logic';
import type { DoseRecord, Medication } from '../types';
import { Hint, PillIcon, Sheet } from '../ui/components';
import { useTheme } from '../ui/theme';
import { radius, size, space, type } from '../ui/tokens';

/** The last week of logged doses. Tapping one offers to remove it (the parent confirms). */
export function HistorySheet({
  visible,
  meds,
  doses,
  now,
  onRemove,
  onClose,
}: {
  visible: boolean;
  meds: Medication[];
  doses: DoseRecord[];
  now: number;
  onRemove: (dose: DoseRecord, name: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const recent = doses.filter((d) => d.takenAt > now - 7 * DAY && d.takenAt <= now).sort((a, b) => b.takenAt - a.takenAt);
  const byId = new Map(meds.map((m) => [m.id, m]));

  return (
    <Sheet visible={visible} title="Last 7 days" onClose={onClose}>
      {recent.length === 0 ? (
        <Text style={[type.body, { color: c.inkMuted, textAlign: 'center', marginTop: space[6] }]}>Nothing logged yet.</Text>
      ) : (
        <Hint>Logged something by mistake? Tap it to remove it.</Hint>
      )}
      <View style={{ gap: space[2] }}>
        {recent.map((d) => {
          const med = byId.get(d.medId);
          const name = med?.name ?? 'Removed medicine';
          return (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityHint="Offers to remove this entry"
              onPress={() => onRemove(d, name)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: size.targetPrimary,
                padding: space[3],
                borderRadius: radius.md,
                borderWidth: size.borderControl,
                borderColor: c.line,
                backgroundColor: pressed ? c.sunken : c.surface,
              })}
            >
              {med ? <PillIcon pill={med.pill} size={40} /> : <View style={{ width: 40 }} />}
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: c.ink }]}>{name}</Text>
                {!!med?.dose && <Text style={[type.hint, { color: c.inkMuted }]}>{med.dose}</Text>}
              </View>
              <Text style={[type.body, { color: c.ink }]}>{formatDayTime(d.takenAt, now)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
