import { Text } from 'react-native';
import { formatTime, MINUTE } from '../logic';
import type { Medication } from '../types';
import { BottomSheet, Button, ChoiceList } from '../ui/components';
import { useTheme } from '../ui/theme';
import { type } from '../ui/tokens';

const OFFSETS = [15, 30, 45, 60, 90, 120, 180, 240];
const label = (mins: number) => (mins < 60 ? `${mins} minutes ago` : mins === 60 ? '1 hour ago' : `${mins / 60} hours ago`);

/** For when the dose was taken but not logged at the time. Tapping a time logs it. */
export function TakenEarlierSheet({
  med,
  now,
  onPick,
  onClose,
}: {
  med: Medication | null;
  now: number;
  onPick: (med: Medication, takenAt: number) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  return (
    <BottomSheet visible={med !== null} onRequestClose={onClose}>
      {med && (
        <>
          <Text accessibilityRole="header" style={[type.title, { color: c.ink }]}>
            When did you take {med.name}?
          </Text>
          <ChoiceList
            label={`When did you take ${med.name}?`}
            options={OFFSETS.map((m) => ({ key: String(m), label: label(m), detail: formatTime(now - m * MINUTE) }))}
            onSelect={(key) => onPick(med, now - Number(key) * MINUTE)}
          />
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </>
      )}
    </BottomSheet>
  );
}
