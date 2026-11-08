'use client';

import { useShell } from '@/context/shellContext';
import MembersPanel from './components/MembersPanel';

export default function MembersPage() {
  const { project } = useShell();
  const authority = JSON.stringify([project?.project.id, project?.viewer, project?.permissions]);

  // A permission change must discard open dialogs and their selected people.
  return <MembersPanel key={authority} />;
}
