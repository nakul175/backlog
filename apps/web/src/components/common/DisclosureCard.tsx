'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// A row that states one thing and holds the detail of it behind a toggle.
// `header` is the row itself; `trailing` sits outside the toggle, for a control
// that acts on its own (a link out of the row).
export default function DisclosureCard({
  header,
  trailing,
  children,
}: {
  header: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg bg-muted/40"
    >
      <div className="flex items-center">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-start transition-colors hover:bg-muted/70">
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          />
          {header}
        </CollapsibleTrigger>
        {trailing}
      </div>

      <CollapsibleContent className="border-t border-border/50 bg-background/40 px-3 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
