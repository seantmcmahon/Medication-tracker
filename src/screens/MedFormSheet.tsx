import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatClock, MEALS, newId } from '../logic';
import type { MealKey, Medication, PillColorName, PillLook, PillShape, Settings } from '../types';
import { Button, ChoiceList, Field, Heading, Hint, Icon, PillIcon, Sheet, describePill } from '../ui/components';
import { useTheme } from '../ui/theme';
import { pillColors, radius, size, space, type } from '../ui/tokens';

type Props = {
  visible: boolean;
  /** Medicine being edited, or null to add a new one. */
  med: Medication | null;
  settings: Settings;
  onSave: (med: Medication) => void;
  /** Asks the parent to confirm removal. */
  onRemove: (med: Medication) => void;
  onClose: () => void;
};

export function MedFormSheet(props: Props) {
  return (
    <Sheet visible={props.visible} title={props.med ? 'Edit medicine' : 'Add a medicine'} onClose={props.onClose}>
      {/* Mounted fresh each time the sheet opens, so the fields start from the medicine being edited. */}
      {props.visible && <MedForm key={props.med?.id ?? 'new'} {...props} />}
    </Sheet>
  );
}

const optional = (n: number | null | undefined) => (n != null ? String(n) : '');
type Errors = Partial<Record<'name' | 'min' | 'max' | 'perDay' | 'target' | 'meals', string>>;

function MedForm({ med, settings, onSave, onRemove }: Props) {
  const [name, setName] = useState(med?.name ?? '');
  const [dose, setDose] = useState(med?.dose ?? '');
  const [pill, setPill] = useState<PillLook>(med?.pill ?? { shape: 'round', color: 'white' });
  const [schedule, setSchedule] = useState<Medication['schedule']>(med?.schedule ?? 'interval');
  const [minHours, setMinHours] = useState(med?.schedule === 'interval' ? String(med.minHours) : '');
  const [maxHours, setMaxHours] = useState(optional(med?.maxHours));
  const [maxPerDay, setMaxPerDay] = useState(optional(med?.maxPerDay));
  const [dailyTarget, setDailyTarget] = useState(optional(med?.dailyTarget));
  const [meals, setMeals] = useState<MealKey[]>(med?.meals ?? []);
  const [notes, setNotes] = useState(med?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const cutoff = formatClock(settings.lastDoseBy);
  const dayStart = formatClock(settings.dayStart);

  const save = () => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter the name of the medicine.';
    const common = {
      id: med?.id ?? newId(),
      name: name.trim(),
      dose: dose.trim(),
      notes: notes.trim(),
      pill: pill.shape === 'capsule' ? pill : { shape: pill.shape, color: pill.color },
      color: med?.color ?? '#1565C0',
    };

    if (schedule === 'meals') {
      if (meals.length === 0) e.meals = 'Choose at least one meal to take it with.';
      setErrors(e);
      if (Object.keys(e).length > 0) return;
      return onSave({ ...common, schedule, meals, minHours: 0, maxHours: null, maxPerDay: null, dailyTarget: null });
    }

    const min = parseNumber(minHours);
    const max = maxHours.trim() === '' ? null : parseNumber(maxHours);
    const perDay = maxPerDay.trim() === '' ? null : parseNumber(maxPerDay);
    const target = dailyTarget.trim() === '' ? null : parseNumber(dailyTarget);
    const isCount = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1);

    if (min === null || Number.isNaN(min) || min <= 0) e.min = 'Enter a number of hours, for example 4.';
    else if (max !== null && (Number.isNaN(max) || max <= min)) e.max = 'Make this longer than the minimum gap.';
    if (!isCount(perDay)) e.perDay = 'Enter a whole number, for example 4.';
    if (!isCount(target)) e.target = 'Enter a whole number, for example 4.';
    else if (target !== null && perDay !== null && target > perDay) e.target = `That's more than the ${perDay} allowed in 24 hours.`;
    else if (target !== null && min !== null && !Number.isNaN(min)) {
      const dayHours = ((settings.lastDoseBy - settings.dayStart + 24 * 60) % (24 * 60)) / 60;
      if ((target - 1) * min > dayHours)
        e.target = `${target} doses ${min} hours apart don't fit between ${dayStart} and ${cutoff}. Change those times in Your day.`;
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onSave({ ...common, schedule, minHours: min!, maxHours: max, maxPerDay: perDay, dailyTarget: target, meals: [] });
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <Field label="Name" hint="As it says on the box" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
      <Field label="Dose (optional)" hint='For example "2 tablets" or "30/500mg"' value={dose} onChangeText={setDose} />

      <PillPicker pill={pill} onChange={setPill} />

      <Heading>When is it taken?</Heading>
      <ChoiceList
        label="When is it taken?"
        options={[
          { key: 'interval', label: 'Every few hours', detail: 'With a minimum gap between doses', selected: schedule === 'interval' },
          { key: 'meals', label: 'At meal times', detail: 'For example, at breakfast and dinner', selected: schedule === 'meals' },
        ]}
        onSelect={(k) => setSchedule(k as Medication['schedule'])}
      />

      {schedule === 'meals' ? (
        <View style={{ gap: space[2] }}>
          <ChoiceList
            label="Which meals?"
            multiple
            options={MEALS.map((m) => ({
              key: m.key,
              label: m.label,
              detail: `Around ${formatClock(settings.mealTimes[m.key])}`,
              selected: meals.includes(m.key),
            }))}
            onSelect={(k) =>
              setMeals((prev) => (prev.includes(k as MealKey) ? prev.filter((x) => x !== k) : [...prev, k as MealKey]))
            }
          />
          {errors.meals ? <ErrorLine text={errors.meals} /> : null}
          <Hint>
            A reminder goes off at each meal, and the alarm if it isn&apos;t taken within {settings.mealGraceMinutes} minutes. Meal
            times are set in Meal times.
          </Hint>
        </View>
      ) : (
        <>
          <Field
            label="Minimum hours between doses"
            hint="It's OK to take the next one after this. Use decimals for part hours, for example 4.5"
            value={minHours}
            onChangeText={setMinHours}
            keyboardType="decimal-pad"
            error={errors.min}
          />
          <Field
            label="Maximum hours between doses (optional)"
            hint="The alarm goes off if nothing is logged by then. Leave blank for medicine taken only when needed."
            value={maxHours}
            onChangeText={setMaxHours}
            keyboardType="decimal-pad"
            error={errors.max}
          />
          <Field
            label="Doses to fit in each day (optional)"
            hint={`For example 4. Each dose gets a latest time so they all fit in before ${cutoff}.`}
            value={dailyTarget}
            onChangeText={setDailyTarget}
            keyboardType="number-pad"
            error={errors.target}
          />
          <Field
            label="Most doses allowed in 24 hours (optional)"
            hint="For example 4 for anything with paracetamol in it. Leave blank for no limit."
            value={maxPerDay}
            onChangeText={setMaxPerDay}
            keyboardType="number-pad"
            error={errors.perDay}
          />
        </>
      )}

      <Field label="Notes (optional)" hint="For example, take with food" value={notes} onChangeText={setNotes} multiline />

      {hasErrors && <ErrorLine text="Check the boxes marked in red, then save again." />}
      <Button title="Save" icon="check" large onPress={save} />
      {med && <Button title="Remove this medicine" variant="danger" onPress={() => onRemove(med)} style={{ marginTop: space[6] }} />}
    </>
  );
}

function ErrorLine({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Icon name="warning" color={c.danger} size={22} />
      <Text style={[type.label, { color: c.danger, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const SHAPES: { key: PillShape; label: string }[] = [
  { key: 'round', label: 'Round' },
  { key: 'oval', label: 'Oval' },
  { key: 'capsule', label: 'Capsule' },
];

/** Pick the shape and colours of the real tablet, so the card shows what's in the box. */
function PillPicker({ pill, onChange }: { pill: PillLook; onChange: (p: PillLook) => void }) {
  const { c } = useTheme();
  const swatches = (selected: PillColorName, pick: (col: PillColorName) => void, label: string) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {(Object.keys(pillColors) as PillColorName[]).map((col) => (
        <Pressable
          key={col}
          accessibilityRole="radio"
          accessibilityLabel={col}
          accessibilityState={{ checked: selected === col }}
          onPress={() => pick(col)}
          style={{
            width: size.targetMin,
            height: size.targetMin,
            borderRadius: radius.pill,
            backgroundColor: pillColors[col],
            borderWidth: selected === col ? 4 : size.borderControl,
            borderColor: selected === col ? c.action : c.lineStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected === col && <Icon name="check" color="#111C27" size={24} />}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ gap: space[3] }}>
      <Heading>What does it look like?</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <PillIcon pill={pill} size={72} />
        <Text style={[type.bodyStrong, { color: c.ink, flex: 1 }]}>{describePill(pill)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {SHAPES.map((sh) => (
          <Pressable
            key={sh.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: pill.shape === sh.key }}
            onPress={() => onChange({ ...pill, shape: sh.key })}
            style={{
              flex: 1,
              minHeight: 88,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[1],
              borderRadius: radius.sm,
              borderWidth: pill.shape === sh.key ? 3 : size.borderControl,
              borderColor: pill.shape === sh.key ? c.action : c.lineStrong,
              backgroundColor: pill.shape === sh.key ? c.actionTint : c.surface,
            }}
          >
            <PillIcon pill={{ ...pill, shape: sh.key }} size={44} />
            <Text style={[type.label, { color: c.ink }]}>{sh.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[type.label, { color: c.ink }]}>{pill.shape === 'capsule' ? 'Colour of one half' : 'Colour'}</Text>
      {swatches(pill.color, (col) => onChange({ ...pill, color: col }), 'Colour')}
      {pill.shape === 'capsule' && (
        <>
          <Text style={[type.label, { color: c.ink }]}>Colour of the other half</Text>
          {swatches(pill.color2 ?? pill.color, (col) => onChange({ ...pill, color2: col }), 'Colour of the other half')}
        </>
      )}
    </View>
  );
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
