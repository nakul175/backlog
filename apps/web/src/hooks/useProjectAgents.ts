'use client';

import { useContext } from 'react';
import { ShellCtx } from '@/context/shellContext';
import { useAiAgentsQuery } from '@/services/aiAgents.service';

// The agents working in the open project. An agent belongs to a team and reaches the
// projects it is attached to, so the list is read from that team and narrowed to this
// project — the screens inside a project (its chat panel, its schedules, its read-only
// agent list) all want exactly those.
export function useProjectAgents() {
  const project = useContext(ShellCtx)?.project?.project ?? null;
  return useAiAgentsQuery(project?.teamId ?? null, project?.id);
}
