/**
 * Steady design tokens, generated from the Steady design system (tokens.json) and kept in step with it.
 * Three themes share every name: day (default), night (dim, for evenings) and contrast (high contrast).
 */
export type ThemeId = 'day' | 'night' | 'contrast';

export const palettes = {
  day: {
    canvas: '#F3F5F7',
    surface: '#FFFFFF',
    sunken: '#E7EBEF',
    ink: '#111C27',
    inkMuted: '#3E4B58',
    line: '#C9D1D9',
    lineStrong: '#5F6B77',
    action: '#143FA8',
    onAction: '#FFFFFF',
    actionTint: '#EAF0FC',
    statusDue: '#143FA8',
    statusDueTint: '#EAF0FC',
    statusOverdue: '#93270F',
    onOverdue: '#FFFFFF',
    statusOverdueTint: '#FDEEE9',
    statusWait: '#3E4B58',
    statusWaitTint: '#E7EBEF',
    statusDone: '#155A3B',
    onDone: '#FFFFFF',
    statusDoneTint: '#E6F4EC',
    danger: '#A3221B',
    toast: '#111C27',
    onToast: '#FFFFFF',
    toastAction: '#A9C7FF',
    focus: '#111C27',
  },
  night: {
    canvas: '#0E151D',
    surface: '#17212C',
    sunken: '#212D39',
    ink: '#EEF2F6',
    inkMuted: '#B6C2CE',
    line: '#34424F',
    lineStrong: '#8C9BA9',
    action: '#8DB5FF',
    onAction: '#0A1830',
    actionTint: '#16233C',
    statusDue: '#8DB5FF',
    statusDueTint: '#16233C',
    statusOverdue: '#FFA285',
    onOverdue: '#2B0D03',
    statusOverdueTint: '#3A1E15',
    statusWait: '#B6C2CE',
    statusWaitTint: '#212D39',
    statusDone: '#84D6AA',
    onDone: '#05231A',
    statusDoneTint: '#14302A',
    danger: '#FF8E85',
    toast: '#EEF2F6',
    onToast: '#0E151D',
    toastAction: '#143FA8',
    focus: '#EEF2F6',
  },
  contrast: {
    canvas: '#FFFFFF',
    surface: '#FFFFFF',
    sunken: '#FFFFFF',
    ink: '#000000',
    inkMuted: '#1A1A1A',
    line: '#000000',
    lineStrong: '#000000',
    action: '#0031A3',
    onAction: '#FFFFFF',
    actionTint: '#FFFFFF',
    statusDue: '#0031A3',
    statusDueTint: '#FFFFFF',
    statusOverdue: '#962000',
    onOverdue: '#FFFFFF',
    statusOverdueTint: '#FFFFFF',
    statusWait: '#1A1A1A',
    statusWaitTint: '#FFFFFF',
    statusDone: '#00552E',
    onDone: '#FFFFFF',
    statusDoneTint: '#FFFFFF',
    danger: '#8B0000',
    toast: '#000000',
    onToast: '#FFFFFF',
    toastAction: '#FFE14D',
    focus: '#000000',
  },} satisfies Record<ThemeId, Record<string, string>>;

export type Palette = (typeof palettes)['day'];

/** Pill colours match the real tablet, so they're the same in every theme. Always outlined in lineStrong. */
export const pillColors = {
  white: '#FFFFFF',
  cream: '#F1E4C3',
  yellow: '#F5D442',
  orange: '#F29B4B',
  pink: '#F2A7C3',
  red: '#D9534F',
  blue: '#6FA8DC',
  green: '#8BC48A',
  brown: '#9C6B4A',
  lilac: '#B9A3E3',
} as const;
export type PillColor = keyof typeof pillColors;

/** Atkinson Hyperlegible Next, one family name per weight (React Native can't pick weights of a custom font). */
export const fonts = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  medium: 'AtkinsonHyperlegibleNext_500Medium',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
  extraBold: 'AtkinsonHyperlegibleNext_800ExtraBold',
};

/** The type scale. Nothing a person reads is smaller than label or hint (18px). */
export const type = {
  clock: { fontFamily: fonts.extraBold, fontSize: 48, lineHeight: 52 },
  title: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38 },
  medName: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 34 },
  status: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  dose: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 20, lineHeight: 30 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 },
  label: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26 },
  hint: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 26 },
  buttonLarge: { fontFamily: fonts.extraBold, fontSize: 24, lineHeight: 30 },
  button: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 28 },
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const size = {
  targetMin: 56,
  targetPrimary: 76,
  iconMd: 28,
  iconLg: 44,
  pillIcon: 52,
  borderControl: 2,
  borderFocus: 4,
} as const;
