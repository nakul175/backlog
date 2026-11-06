'use client';

import { useEffect, useState } from 'react';

// Which section of the page is being read: the last one whose header has scrolled
// above a line near the top of the viewport (offset). A position check is used
// rather than IntersectionObserver so a tall section still counts as active while
// it fills the viewport, instead of an earlier section that only just touches the
// top edge. The returned setter lets the caller mark a section active right away
// when it jumps to one.
export function useSectionScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(',');

  useEffect(() => {
    const order = key.split(',').filter(Boolean);
    const offset = 96;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = order[0] ?? null;
      for (const id of order) {
        const el = document.querySelector(`#${CSS.escape(id)}`);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);

  return { activeId, setActiveId };
}
