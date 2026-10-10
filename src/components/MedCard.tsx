import { StyleSheet, Text, View } from 'react-native';
import { formatDayTime, formatDuration, formatTime } from '../logic';
import type { Medication, MedStatus } from '../types';
import { Button, colors } from './ui';

type Props = {
  med: Medication;
  status: MedStatus;
  now: number;
  onTake: () => void;
  onTakeEarlier: () => void;
  onEdit: () => void;
};

export function MedCard({ med, status, now, onTake, onTakeEarlier, onEdit }: Props) {
  const tone = colors[status.kind];

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
        <Text style={[styles.statusMain, { color: tone.fg }]}>{headline(status, now)}</Text>
        {detail(med, status, now).map((line) => (
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

function headline(s: MedStatus, now: number): string {
  switch (s.kind) {
    case 'never':
      return 'No doses logged yet';
    case 'wait':
      return `Wait until ${formatTime(s.canTakeAt!)} (${formatDuration(s.canTakeAt! - now)})`;
    case 'ready':
      return s.dueBy !== null ? `OK to take — due by ${formatTime(s.dueBy)}` : 'OK to take if needed';
    case 'overdue':
      return `Overdue by ${formatDuration(now - s.dueBy!)}`;
  }
}

function detail(med: Medication, s: MedStatus, now: number): string[] {
  const lines: string[] = [];
  if (s.lastTaken !== null) {
    lines.push(`Last taken: ${formatDayTime(s.lastTaken, now)} (${formatDuration(now - s.lastTaken)} ago)`);
  }
  if (s.kind === 'wait' && s.limitedByDailyMax) {
    lines.push(`Daily limit reached (${med.maxPerDay} in 24 hours)`);
  } else if (med.maxPerDay !== null) {
    lines.push(`Taken ${s.takenLast24h} of ${med.maxPerDay} allowed in the last 24 hours`);
  }
  if (s.kind === 'wait' && s.dueBy !== null) {
    lines.push(`Alarm if not taken by ${formatDayTime(s.dueBy, now)}`);
  }
  return lines;
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
