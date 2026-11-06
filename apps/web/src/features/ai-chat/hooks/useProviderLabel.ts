'use client';

import { useShell } from '@/context/shellContext';
import { useIntegrationCatalogQuery } from '@/services/integrations.service';

// Maps a model provider key to the label the integration catalog gives it, falling back
// to the key itself while the catalog loads or for a provider it does not carry. The
// catalog is served by the team that owns the open project.
export function useProviderLabel() {
  const teamId = useShell().project?.project.teamId ?? null;
  const catalog = useIntegrationCatalogQuery(teamId).data ?? [];
  return (key: string) => catalog.find((entry) => entry.key === key)?.label ?? key;
}
