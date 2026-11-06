import type { ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The look of a trigger chip, shared with the field-trigger chip, which is a popover
// trigger rather than this button.
export const TRIGGER_CHIP =
  'inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary';

// One enabled trigger: the icon alone, with its name in a tooltip. Three labelled
// chips would take more of the row than the agent's own name, and each trigger is one
// recognisable mark.
export function AgentTriggerChip({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={TRIGGER_CHIP} aria-label={label}>
          <Icon className="size-3 shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
