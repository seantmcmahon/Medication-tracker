import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { palettes, type Palette, type ThemeId } from './tokens';

type Theme = { id: ThemeId; c: Palette };

const ThemeContext = createContext<Theme>({ id: 'day', c: palettes.day });

export function ThemeProvider({ id, children }: { id: ThemeId; children: ReactNode }) {
  const value = useMemo(() => ({ id, c: palettes[id] }), [id]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Styles that depend on the theme, rebuilt only when the theme changes. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(make: (c: Palette, id: ThemeId) => T): T {
  const { c, id } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(make(c, id)), [c, id]);
}
