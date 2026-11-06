'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccountPreferences } from '@/services/preferences.service';
import { useHotkeySettingsQuery } from '@/services/hotkeys.service';
import {
  applyOverrides,
  DEFAULT_COMBOS,
  formatCombo,
  matchesCombo,
  type HotkeyCombos,
  type HotkeyId,
} from '@/utils/hotkeys';

// The combinations in effect for the signed-in user. Every listener and every
// shortcut label reads them from here, so a rebound key applies everywhere at once.
// Three layers, each overriding the one before: the built-in bindings, the
// instance-wide ones set in god mode, then the user's own.
const HotkeysCtx = createContext<HotkeyCombos>(DEFAULT_COMBOS);

export function HotkeysProvider({ children }: { children: ReactNode }) {
  const instance = useHotkeySettingsQuery().data;
  const { hotkeys: personal } = useAccountPreferences();

  const combos = useMemo(
    () => applyOverrides(applyOverrides(DEFAULT_COMBOS, instance ?? {}), personal),
    [instance, personal],
  );

  return <HotkeysCtx.Provider value={combos}>{children}</HotkeysCtx.Provider>;
}

export function useHotkeyCombos(): HotkeyCombos {
  return useContext(HotkeysCtx);
}

// Whether a key press is the shortcut `id`, under the combinations in effect.
export function useHotkeyMatch() {
  const combos = useHotkeyCombos();
  return useMemo(() => (e: KeyboardEvent, id: HotkeyId) => matchesCombo(e, combos[id]), [combos]);
}

// True on macOS, so a shortcut is shown as ⌘K rather than Ctrl+K. Resolved after
// mount: the server has no platform to read, and a mismatch would hydrate wrong.
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent));
  }, []);
  return isMac;
}

// Formats any shortcut for display, for a component that shows several of them.
// Returns null when the id is not bound.
export function useHotkeyFormatter(): (id: HotkeyId) => string | null {
  const combos = useHotkeyCombos();
  const isMac = useIsMac();
  return useMemo(
    () => (id: HotkeyId) => (combos[id] ? formatCombo(combos[id], isMac) : null),
    [combos, isMac],
  );
}

// One shortcut formatted for display, or null when it is not bound.
export function useHotkeyLabel(id: HotkeyId): string | null {
  return useHotkeyFormatter()(id);
}
