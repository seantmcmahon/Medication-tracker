import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DAY, formatDayTime } from '../logic';
import type { DoseRecord, Medication } from '../types';
import { colors, Sheet } from './ui';

type Props = {
  visible: boolean;
  meds: Medication[];
  doses: DoseRecord[];
  now: number;
  onDelete: (dose: DoseRecord) => void;
  onClose: () => void;
};

export function HistoryModal({ visible, meds, doses, now, onDelete, onClose }: Props) {
  const recent = doses.filter((d) => d.takenAt > now - 7 * DAY).sort((a, b) => b.takenAt - a.takenAt);
  const medById = new Map(meds.map((m) => [m.id, m]));

  const confirmDelete = (dose: DoseRecord, name: string) =>
    Alert.alert('Remove this entry?', `${name} at ${formatDayTime(dose.takenAt, now)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onDelete(dose) },
    ]);

  return (
    <Sheet visible={visible} title="Last 7 days" onClose={onClose}>
      {recent.length === 0 && <Text style={styles.empty}>Nothing logged yet.</Text>}
      {recent.length > 0 && <Text style={styles.hint}>Logged something by mistake? Tap it to remove it.</Text>}
      {recent.map((d) => {
        const med = medById.get(d.medId);
        const name = med?.name ?? 'Removed medication';
        return (
          <Pressable key={d.id} onPress={() => confirmDelete(d, name)} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: med?.color ?? colors.border }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{name}</Text>
              {!!med?.dose && <Text style={styles.dose}>{med.dose}</Text>}
            </View>
            <Text style={styles.time}>{formatDayTime(d.takenAt, now)}</Text>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 18, color: colors.muted, textAlign: 'center', marginTop: 32 },
  hint: { fontSize: 16, color: colors.muted, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  dot: { width: 16, height: 16, borderRadius: 8 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  dose: { fontSize: 15, color: colors.muted },
  time: { fontSize: 16, color: colors.text },
});
