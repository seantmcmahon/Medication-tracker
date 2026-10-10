import { StyleSheet, Text } from 'react-native';
import { formatTime, MINUTE } from '../logic';
import type { Medication } from '../types';
import { Button, colors, Sheet } from './ui';

const OFFSETS = [15, 30, 45, 60, 90, 120, 180, 240];

type Props = {
  med: Medication | null;
  now: number;
  onPick: (med: Medication, takenAt: number) => void;
  onClose: () => void;
};

/** For when he forgot to tap the button at the time he took the tablet. */
export function TakenEarlierModal({ med, now, onPick, onClose }: Props) {
  return (
    <Sheet visible={med !== null} title={med ? `When did you take ${med.name}?` : ''} onClose={onClose}>
      <Text style={styles.intro}>Pick roughly when you took it:</Text>
      {med &&
        OFFSETS.map((mins) => {
          const at = now - mins * MINUTE;
          return (
            <Button
              key={mins}
              kind="secondary"
              title={`${label(mins)} ago  (${formatTime(at)})`}
              onPress={() => onPick(med, at)}
              style={{ marginBottom: 10 }}
            />
          );
        })}
    </Sheet>
  );
}

function label(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = mins / 60;
  return h === 1 ? '1 hour' : `${h} hours`;
}

const styles = StyleSheet.create({
  intro: { fontSize: 18, color: colors.text, marginBottom: 12 },
});
