import { Text, View } from 'react-native';
import { cardText } from '../logic';
import type { Medication, MedStatus, TimingSettings } from '../types';
import { Button, Card, DoseDots, PillIcon, StatusBadge } from '../ui/components';
import { useTheme } from '../ui/theme';
import { radius, space, type } from '../ui/tokens';

type Props = {
  med: Medication;
  status: MedStatus;
  now: number;
  settings: TimingSettings;
  onTake: () => void;
  onTakeEarlier: () => void;
};

/** One medicine: what it looks like, what to do now, and the button to log it. No Edit here (carer settings). */
export function MedCard({ med, status, now, settings, onTake, onTakeEarlier }: Props) {
  const { c, id } = useTheme();
  const { state, headline, detail } = cardText(med, status, now, settings);
  const band = {
    due: c.statusDueTint,
    overdue: c.statusOverdueTint,
    wait: c.statusWaitTint,
    done: c.statusDoneTint,
    asNeeded: c.actionTint,
  }[state];
  const actNow = state === 'due' || state === 'overdue';

  return (
    <Card emphasis={state === 'overdue' ? 'overdue' : undefined}>
      <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'flex-start' }}>
        <PillIcon pill={med.pill} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text accessibilityRole="header" style={[type.medName, { color: c.ink }]}>
            {med.name}
          </Text>
          {!!med.dose && <Text style={[type.dose, { color: c.inkMuted }]}>{med.dose}</Text>}
          {!!med.notes && <Text style={[type.body, { color: c.ink }]}>{med.notes}</Text>}
        </View>
      </View>

      <View
        style={{
          backgroundColor: band,
          borderRadius: radius.md,
          padding: space[4],
          gap: space[2],
          borderWidth: id === 'contrast' ? 3 : 0,
          borderColor: c.ink,
        }}
      >
        <StatusBadge state={state} />
        <Text style={[type.status, { color: state === 'overdue' ? c.statusOverdue : c.ink }]}>{headline}</Text>
        {!!detail && <Text style={[type.body, { color: c.inkMuted }]}>{detail}</Text>}
      </View>

      {med.schedule === 'interval' && med.dailyTarget !== null && status.today && (
        <DoseDots taken={status.today.taken} target={med.dailyTarget} />
      )}

      <View style={{ gap: space[2] }}>
        <Button title="I've taken it" icon="check" large variant={actNow ? 'primary' : 'secondary'} onPress={onTake} />
        <Button title="I took it earlier" icon="history" variant="quiet" onPress={onTakeEarlier} />
      </View>
    </Card>
  );
}
