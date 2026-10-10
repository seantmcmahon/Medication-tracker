import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#1B1F24',
  muted: '#5A6470',
  border: '#D5DBE1',
  primary: '#1565C0',
  danger: '#C62828',
  wait: { bg: '#FFF4E0', fg: '#8A4B00', label: 'Not yet' },
  ready: { bg: '#E3F5E6', fg: '#1B6E2A', label: 'OK to take' },
  never: { bg: '#E3F5E6', fg: '#1B6E2A', label: 'OK to take' },
  overdue: { bg: '#FDE3E3', fg: '#B71C1C', label: 'Take now!' },
};

export const MED_COLORS = ['#1565C0', '#2E7D32', '#6A1B9A', '#EF6C00', '#AD1457', '#00838F', '#5D4037'];

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'link';
  style?: ViewStyle;
  big?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, kind = 'primary', style, big, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: colors.primary },
        kind === 'danger' && { backgroundColor: colors.danger },
        kind === 'secondary' && styles.secondary,
        kind === 'link' && styles.link,
        big && styles.big,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          (kind === 'secondary' || kind === 'link') && { color: colors.primary },
          big && { fontSize: 22 },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Button title="Close" kind="link" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  big: { minHeight: 64 },
  secondary: { backgroundColor: '#fff', borderWidth: 2, borderColor: colors.primary },
  link: { backgroundColor: 'transparent', minHeight: 44, paddingHorizontal: 8 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
});
