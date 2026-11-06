import { useEffect, useRef } from 'react';

// Escape closes the current surface (a side panel, a full-page view). When a
// dropdown, popover, or dialog is open (rendered in a portal), let it handle
// Escape first so it closes instead of the surface — a dialog opened from the
// surface would otherwise take the surface with it. A surface that stacks another
// surface on top of itself, which is not a dialog, passes enabled=false while that
// one is open. The handler is kept in a ref so the listener is registered once and
// always calls the latest onExit.
export function useExitOnEscape(onExit: () => void, enabled = true) {
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || !enabledRef.current) return;
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      onExitRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
