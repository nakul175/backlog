import { Cloud, Terminal, type LucideIcon } from 'lucide-react';

// An internal agent runs on a provider's model in the cloud; an external one is driven
// from a runner on the operator's own machine.
export const AGENT_KIND_ICON: Record<'internal' | 'external', LucideIcon> = {
  internal: Cloud,
  external: Terminal,
};
