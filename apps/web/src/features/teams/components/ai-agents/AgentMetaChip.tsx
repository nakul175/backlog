import type { ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const META_CHIP =
  'inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground';

// A single meta chip: an icon plus a short value. `label` says in full what the chip
// shows, so a count can stand as a bare number and name itself in a tooltip instead of
// spelling out "35 actions" three times across the row.
export function AgentMetaChip({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label?: string;
  children: React.ReactNode;
}) {
  if (!label) {
    return (
      <span className={META_CHIP}>
        <Icon className="size-3 shrink-0" />
        {children}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={META_CHIP} aria-label={label}>
          <Icon className="size-3 shrink-0" />
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
