import { StyleSheet, Text, View } from 'react-native';
import { describeStatus } from '../logic';
import type { Medication, MedStatus, Settings } from '../types';
import { Button, colors } from './ui';

type Props = {
  med: Medication;
  status: MedStatus;
  now: number;
  settings: Settings;
  onTake: () => void;
  onTakeEarlier: () => void;
  onEdit: () => void;
};

export function MedCard({ med, status, now, settings, onTake, onTakeEarlier, onEdit }: Props) {
  const tone = colors[status.kind];
  const text = describeStatus(med, status, now, settings);

  return (
    <View style={[styles.card, { borderLeftColor: med.color }]}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{med.name}</Text>
          {!!med.dose && <Text style={styles.dose}>{med.dose}</Text>}
          {!!med.notes && <Text style={styles.notes}>{med.notes}</Text>}
        </View>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.fg }]}>{tone.label}</Text>
        </View>
      </View>

      <View style={[styles.statusBox, { backgroundColor: tone.bg }]}>
        <Text style={[styles.statusMain, { color: tone.fg }]}>{text.headline}</Text>
        {text.details.map((line) => (
          <Text key={line} style={styles.statusDetail}>
            {line}
          </Text>
        ))}
      </View>

      <Button
        big
        title="✓  I've taken it"
        kind={status.kind === 'overdue' ? 'danger' : 'primary'}
        onPress={onTake}
      />
      <View style={styles.links}>
        <Button kind="link" title="Took it earlier…" onPress={onTakeEarlier} />
        <Button kind="link" title="Edit" onPress={onEdit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  name: { fontSize: 26, fontWeight: '800', color: colors.text },
  dose: { fontSize: 18, color: colors.muted, marginTop: 2 },
  notes: { fontSize: 17, color: colors.text, marginTop: 4, fontStyle: 'italic' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 16, fontWeight: '800' },
  statusBox: { borderRadius: 12, padding: 12, marginBottom: 12 },
  statusMain: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  statusDetail: { fontSize: 16, color: colors.text, marginTop: 2 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
