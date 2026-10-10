/**
 * Steady components for React Native. Each one follows its page in the Steady design system:
 * words beside every icon, nothing tappable under 56px, one primary action per card or sheet.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { CardState } from '../logic';
import type { PillLook } from '../types';
import { useStyles, useTheme } from './theme';
import { fonts, pillColors, radius, size, space, type } from './tokens';

// ---------- Icon ----------

const PATHS = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z', 'M12 7.5V12l3 2'],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  pill: ['M8.5 4.5a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0v-7a4 4 0 0 1 4-4z', 'M4.5 12h8', 'M15.5 9.5l4 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  undo: ['M9 7L4.5 11.5L9 16', 'M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2'],
  lock: ['M7 10.5V8a5 5 0 0 1 10 0v2.5', 'M5.5 10.5h13v9.5h-13z'],
  gear: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'M5.3 5.3l2.1 2.1', 'M16.6 16.6l2.1 2.1', 'M5.3 18.7l2.1-2.1', 'M16.6 7.4l2.1-2.1'],
  warning: ['M12 3.5l9 16H3z', 'M12 10v4', 'M12 17v.5'],
  history: ['M4 12a8 8 0 1 0 2.5-5.8', 'M4 4.5V8h3.5', 'M12 8v4.5l3 1.5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  chevron: ['M9 5l7 7l-7 7'],
};
export type IconName = keyof typeof PATHS;

export function Icon({ name, color, size: s = size.iconMd }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

// ---------- Button ----------

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  large?: boolean;
  icon?: IconName;
  /** Full width (default) or sized to its words. */
  block?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({ title, onPress, variant = 'primary', large, icon, block = true, disabled, style, accessibilityHint }: ButtonProps) {
  const { c } = useTheme();
  const s = useStyles((c) => ({
    base: {
      minHeight: size.targetMin,
      paddingHorizontal: space[5],
      borderRadius: radius.md,
      borderWidth: size.borderControl,
      borderColor: 'transparent',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[3],
    },
    large: { minHeight: size.targetPrimary },
    primary: { backgroundColor: c.action },
    secondary: { backgroundColor: c.surface, borderColor: c.action },
    quiet: { backgroundColor: 'transparent' },
    danger: { backgroundColor: c.surface, borderColor: c.danger },
    text: { ...type.button, textAlign: 'center', flexShrink: 1 },
    textLarge: type.buttonLarge,
    quietText: { textDecorationLine: 'underline' },
  }));
  const fg = variant === 'primary' ? c.onAction : variant === 'danger' ? c.danger : c.action;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.base,
        large && s.large,
        s[variant],
        !block && { alignSelf: 'flex-start' },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
    >
      {icon && <Icon name={icon} color={fg} />}
      <Text style={[s.text, large && s.textLarge, variant === 'quiet' && s.quietText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

// ---------- Status ----------

const STATES: Record<CardState, { icon: IconName; word: string }> = {
  due: { icon: 'pill', word: 'Take now' },
  overdue: { icon: 'bell', word: 'Overdue' },
  wait: { icon: 'clock', word: 'Not yet' },
  done: { icon: 'check', word: 'Done for today' },
  asNeeded: { icon: 'pill', word: 'If needed' },
};

/** Solid fill = act now; pale tint = nothing to do. Always an icon and a word. */
export function StatusBadge({ state }: { state: CardState }) {
  const { c } = useTheme();
  const look = {
    due: { bg: c.statusDue, fg: c.onAction, border: c.statusDue },
    overdue: { bg: c.statusOverdue, fg: c.onOverdue, border: c.statusOverdue },
    wait: { bg: c.statusWaitTint, fg: c.statusWait, border: c.line },
    done: { bg: c.statusDoneTint, fg: c.statusDone, border: c.statusDone },
    asNeeded: { bg: c.actionTint, fg: c.action, border: c.action },
  }[state];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space[1],
        minHeight: 36,
        paddingVertical: space[1],
        paddingLeft: space[2],
        paddingRight: space[3],
        borderRadius: radius.sm,
        borderWidth: size.borderControl,
        backgroundColor: look.bg,
        borderColor: look.border,
      }}
    >
      <Icon name={STATES[state].icon} color={look.fg} size={24} />
      <Text style={[type.label, { color: look.fg }]}>{STATES[state].word}</Text>
    </View>
  );
}

// ---------- Pill icon ----------

export function PillIcon({ pill, size: s = size.pillIcon }: { pill: PillLook; size?: number }) {
  const { c } = useTheme();
  const c1 = pillColors[pill.color];
  const c2 = pillColors[pill.color2 ?? pill.color];
  const stroke = c.lineStrong;
  return (
    <Svg width={s} height={s} viewBox="0 0 52 52" accessibilityElementsHidden importantForAccessibility="no">
      {pill.shape === 'capsule' ? (
        <>
          <Path d="M10 26 a10 10 0 0 1 10 -10 h6 v20 h-6 a10 10 0 0 1 -10 -10z" fill={c1} stroke={stroke} strokeWidth={2} />
          <Path d="M26 16 h6 a10 10 0 0 1 0 20 h-6z" fill={c2} stroke={stroke} strokeWidth={2} />
        </>
      ) : pill.shape === 'oval' ? (
        <>
          <Rect x={6} y={16} width={40} height={20} rx={10} fill={c1} stroke={stroke} strokeWidth={2} />
          <Path d="M26 19v14" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx={26} cy={26} r={18} fill={c1} stroke={stroke} strokeWidth={2} />
          <Path d="M15 26h22" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

export function describePill(pill: PillLook): string {
  const colour = pill.shape === 'capsule' && pill.color2 && pill.color2 !== pill.color ? `${pill.color} and ${pill.color2}` : pill.color;
  const shape = pill.shape === 'capsule' ? 'capsule' : `${pill.shape} tablet`;
  return `${colour[0].toUpperCase()}${colour.slice(1)} ${shape}`;
}

// ---------- Dose dots ----------

export function DoseDots({ taken, target }: { taken: number; target: number }) {
  const { c } = useTheme();
  const done = Math.min(taken, target);
  return (
    <View
      accessible
      accessibilityLabel={`${done} of ${target} doses taken today`}
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3] }}
    >
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {Array.from({ length: target }, (_, i) => (
          <View
            key={i}
            style={{
              width: 32,
              height: 32,
              borderRadius: radius.pill,
              borderWidth: size.borderControl,
              borderColor: i < done ? c.statusDone : c.lineStrong,
              backgroundColor: i < done ? c.statusDone : c.sunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {i < done && <Icon name="check" color={c.onDone} size={20} />}
          </View>
        ))}
      </View>
      <Text style={[type.bodyStrong, { color: c.ink }]}>
        {done} of {target} today
      </Text>
    </View>
  );
}

// ---------- Section header ----------

export function SectionHeader({ title, count }: { title: string; count?: number }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[6], marginBottom: space[3] }}>
      <Text style={[type.label, { color: c.ink, textTransform: 'uppercase', letterSpacing: 1 }]}>{title}</Text>
      {count !== undefined && (
        <View style={{ minWidth: 32, height: 32, paddingHorizontal: space[2], borderRadius: radius.pill, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.label, { color: c.surface }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ---------- Card ----------

export function Card({ children, emphasis, style }: { children: ReactNode; emphasis?: 'overdue'; style?: StyleProp<ViewStyle> }) {
  const { c, id } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          padding: space[5],
          gap: space[4],
          borderWidth: id === 'contrast' ? 3 : size.borderControl,
          borderColor: id === 'contrast' ? c.ink : c.line,
        },
        id === 'day' && { shadowColor: '#111C27', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
        emphasis === 'overdue' && { borderWidth: 3, borderColor: c.statusOverdue },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------- Undo bar ----------

export function UndoBar({ message, onUndo }: { message: string; onUndo: () => void }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: c.toast,
        borderRadius: radius.md,
        paddingVertical: space[2],
        paddingRight: space[2],
        paddingLeft: space[4],
        minHeight: size.targetPrimary,
      }}
    >
      <Icon name="check" color={c.onToast} />
      <Text style={[type.bodyStrong, { color: c.onToast, flex: 1 }]}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onUndo}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: size.targetMin,
          paddingHorizontal: space[4],
          borderRadius: radius.sm,
          borderWidth: size.borderControl,
          borderColor: c.toastAction,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon name="undo" color={c.toastAction} size={24} />
        <Text style={[type.button, { color: c.toastAction }]}>Undo</Text>
      </Pressable>
    </View>
  );
}

// ---------- Choice list ----------

export type Choice = { key: string; label: string; detail?: string; selected?: boolean; leading?: ReactNode };

export function ChoiceList({
  label,
  options,
  onSelect,
  multiple,
}: {
  label: string;
  options: Choice[];
  onSelect: (key: string) => void;
  multiple?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label} style={{ gap: space[2] }}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole={multiple ? 'checkbox' : 'radio'}
          accessibilityState={{ checked: !!o.selected }}
          onPress={() => onSelect(o.key)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[4],
            minHeight: 64,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            borderRadius: radius.sm,
            borderWidth: o.selected ? 3 : size.borderControl,
            borderColor: o.selected ? c.action : c.lineStrong,
            backgroundColor: o.selected ? c.actionTint : pressed ? c.sunken : c.surface,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: multiple ? 8 : radius.pill,
              borderWidth: size.borderControl,
              borderColor: o.selected ? c.action : c.lineStrong,
              backgroundColor: o.selected ? c.action : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {o.selected && <Icon name="check" color={c.onAction} size={22} />}
          </View>
          {o.leading}
          <View style={{ flex: 1 }}>
            <Text style={[type.button, { color: c.ink }]}>{o.label}</Text>
            {!!o.detail && <Text style={[type.hint, { color: c.inkMuted }]}>{o.detail}</Text>}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Stepper ----------

export function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const { c } = useTheme();
  const btn = (icon: IconName, onPress: () => void, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size.targetMin,
        height: size.targetMin,
        borderRadius: radius.md,
        borderWidth: size.borderControl,
        borderColor: c.action,
        backgroundColor: pressed ? c.actionTint : c.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} color={c.action} />
    </Pressable>
  );
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.body, { color: c.ink }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        {btn('minus', onMinus, `${label}: earlier or less`)}
        <Text accessibilityLiveRegion="polite" style={[type.bodyStrong, { color: c.ink, minWidth: 128, textAlign: 'center', flex: 1 }]}>
          {value}
        </Text>
        {btn('plus', onPlus, `${label}: later or more`)}
      </View>
    </View>
  );
}

// ---------- Field ----------

export function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string | null } & TextInputProps) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text style={[type.label, { color: c.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.inkMuted}
        {...input}
        style={[
          type.body,
          {
            minHeight: 60,
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            borderRadius: radius.sm,
            borderWidth: error ? 3 : size.borderControl,
            borderColor: error ? c.danger : c.lineStrong,
            backgroundColor: c.surface,
            color: c.ink,
          },
          input.multiline && { minHeight: 96, textAlignVertical: 'top' },
        ]}
      />
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="warning" color={c.danger} size={22} />
          <Text style={[type.label, { color: c.danger, flex: 1 }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[type.hint, { color: c.inkMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ---------- Carer gate: press and hold for 1.5 seconds ----------

const HOLD_MS = 1500;

export function CarerGate({ onOpen }: { onOpen: () => void }) {
  const { c } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const holding = useRef(false);
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const start = () => {
    holding.current = true;
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished && holding.current) {
        holding.current = false;
        progress.setValue(0);
        onOpen();
      }
    });
  };
  const cancel = () => {
    holding.current = false;
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Carer settings"
      accessibilityHint="Press and hold to open"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onOpen}
      onPressIn={start}
      onPressOut={cancel}
      style={{
        minHeight: size.targetMin,
        borderRadius: radius.md,
        borderWidth: size.borderControl,
        borderStyle: 'dashed',
        borderColor: c.lineStrong,
        backgroundColor: c.surface,
        overflow: 'hidden',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          backgroundColor: c.actionTint,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3] }}>
        <Icon name="lock" color={c.ink} />
        <Text style={[type.button, { color: c.ink, flex: 1 }]}>Carer settings</Text>
        <Text style={[type.hint, { color: c.inkMuted }]}>Press and hold</Text>
      </View>
    </Pressable>
  );
}

// ---------- Full-screen sheet ----------

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            backgroundColor: c.surface,
            borderBottomWidth: size.borderControl,
            borderBottomColor: c.line,
          }}
        >
          <Text accessibilityRole="header" style={[type.title, { color: c.ink, flex: 1 }]}>
            {title}
          </Text>
          <Button title="Close" variant="secondary" icon="close" block={false} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[7], gap: space[5] }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------- Bottom sheet (confirmations, quick choices). Never closes on a tap outside it. ----------

export function BottomSheet({ visible, onRequestClose, children }: { visible: boolean; onRequestClose: () => void; children: ReactNode }) {
  const { c, id } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10, 14, 20, 0.5)' }}>
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderWidth: id === 'contrast' ? 3 : 0,
            borderColor: c.ink,
            maxHeight: '90%',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: space[5], paddingTop: space[6], gap: space[3] }}>{children}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export type Confirmation = {
  title: string;
  message: string;
  tone: 'caution' | 'danger';
  /** The safe choice, shown first and largest. */
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export function ConfirmSheet({ confirmation, onClose }: { confirmation: Confirmation | null; onClose: () => void }) {
  const { c } = useTheme();
  const danger = confirmation?.tone === 'danger';
  return (
    <BottomSheet visible={confirmation !== null} onRequestClose={onClose}>
      {confirmation && (
        <>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: danger ? c.statusOverdueTint : c.statusWaitTint,
            }}
          >
            <Icon name={danger ? 'warning' : 'clock'} color={danger ? c.statusOverdue : c.ink} size={size.iconLg} />
          </View>
          <Text accessibilityRole="header" style={[type.title, { color: c.ink }]}>
            {confirmation.title}
          </Text>
          <Text style={[type.body, { color: c.ink, marginBottom: space[3] }]}>{confirmation.message}</Text>
          <Button title={confirmation.cancelLabel} large onPress={onClose} />
          <Button
            title={confirmation.confirmLabel}
            variant={danger ? 'danger' : 'secondary'}
            onPress={() => {
              onClose();
              confirmation.onConfirm();
            }}
          />
        </>
      )}
    </BottomSheet>
  );
}

// ---------- Small text helpers ----------

export function Hint({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[type.hint, { color: c.inkMuted }]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" style={[type.status, { color: c.ink }]}>
      {children}
    </Text>
  );
}

export { fonts };
