import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { newId } from '../logic';
import type { Medication } from '../types';
import { Button, colors, MED_COLORS, Sheet } from './ui';

type Props = {
  visible: boolean;
  /** Medication being edited, or null to add a new one. */
  med: Medication | null;
  usedColors: string[];
  onSave: (med: Medication) => void;
  onDelete: (med: Medication) => void;
  onClose: () => void;
};

export function MedFormModal(props: Props) {
  const { visible, med, onClose } = props;
  return (
    <Sheet visible={visible} title={med ? 'Edit medication' : 'Add medication'} onClose={onClose}>
      {/* Mounted fresh each time the sheet opens, so the fields start from the medication being edited. */}
      {visible && <MedForm key={med?.id ?? 'new'} {...props} />}
    </Sheet>
  );
}

function MedForm({ med, usedColors, onSave, onDelete }: Props) {
  const [name, setName] = useState(med?.name ?? '');
  const [dose, setDose] = useState(med?.dose ?? '');
  const [minHours, setMinHours] = useState(med ? String(med.minHours) : '');
  const [maxHours, setMaxHours] = useState(med?.maxHours != null ? String(med.maxHours) : '');
  const [maxPerDay, setMaxPerDay] = useState(med?.maxPerDay != null ? String(med.maxPerDay) : '');
  const [notes, setNotes] = useState(med?.notes ?? '');
  const [color, setColor] = useState(
    () => med?.color ?? MED_COLORS.find((c) => !usedColors.includes(c)) ?? MED_COLORS[0],
  );

  const save = () => {
    const min = parseNumber(minHours);
    const max = maxHours.trim() === '' ? null : parseNumber(maxHours);
    const perDay = maxPerDay.trim() === '' ? null : parseNumber(maxPerDay);

    if (!name.trim()) return Alert.alert('Name needed', 'Please enter the name of the medication.');
    if (min === null || min <= 0)
      return Alert.alert('Minimum gap needed', 'Enter how many hours must pass between doses, e.g. 4.');
    if (max !== null && (Number.isNaN(max) || max <= min))
      return Alert.alert('Check the maximum gap', 'The maximum gap must be longer than the minimum gap.');
    if (perDay !== null && (Number.isNaN(perDay) || perDay < 1 || !Number.isInteger(perDay)))
      return Alert.alert('Check the daily limit', 'The daily limit must be a whole number, e.g. 4.');

    onSave({
      id: med?.id ?? newId(),
      name: name.trim(),
      dose: dose.trim(),
      minHours: min,
      maxHours: max,
      maxPerDay: perDay,
      notes: notes.trim(),
      color,
    });
  };

  const confirmDelete = () => {
    if (!med) return;
    Alert.alert(`Remove ${med.name}?`, 'It will no longer appear or send reminders. Past doses stay in the history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onDelete(med) },
    ]);
  };

  return (
    <>
      <Field label="Name" hint="e.g. Paracetamol">
        <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />
      </Field>
      <Field label="Dose (optional)" hint='e.g. "2 tablets" or "50mg"'>
        <TextInput style={styles.input} value={dose} onChangeText={setDose} />
      </Field>
      <Field
        label="Minimum hours between doses"
        hint="He'll be told when it's OK to take the next one. Use decimals for part hours, e.g. 4.5"
      >
        <TextInput style={styles.input} value={minHours} onChangeText={setMinHours} keyboardType="decimal-pad" />
      </Field>
      <Field
        label="Maximum hours between doses (optional)"
        hint="An alarm goes off if no dose is logged by then. Leave blank for 'only when needed' medication."
      >
        <TextInput style={styles.input} value={maxHours} onChangeText={setMaxHours} keyboardType="decimal-pad" />
      </Field>
      <Field label="Most doses allowed in 24 hours (optional)" hint="e.g. 4 for paracetamol. Leave blank for no limit.">
        <TextInput style={styles.input} value={maxPerDay} onChangeText={setMaxPerDay} keyboardType="number-pad" />
      </Field>
      <Field label="Notes (optional)" hint="e.g. Take with food">
        <TextInput style={[styles.input, { minHeight: 80 }]} value={notes} onChangeText={setNotes} multiline />
      </Field>
      <Field label="Colour">
        <View style={styles.colors}>
          {MED_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityLabel={`Colour ${c}`}
              onPress={() => setColor(c)}
              style={[styles.swatch, { backgroundColor: c }, c === color && styles.swatchSelected]}
            />
          ))}
        </View>
      </Field>

      <Button big title="Save" onPress={save} style={{ marginTop: 8 }} />
      {med && <Button title="Remove this medication" kind="link" onPress={confirmDelete} style={{ marginTop: 16 }} />}
    </>
  );
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  hint: { fontSize: 15, color: colors.muted, marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 20,
    color: colors.text,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 22 },
  swatchSelected: { borderWidth: 4, borderColor: colors.text },
});
