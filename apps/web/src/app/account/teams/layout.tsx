import type { ReactNode } from 'react';
import ManageTeamsLayout from '@/features/teams/ManageTeamsLayout';

export default function Layout({ children }: { children: ReactNode }) {
  return <ManageTeamsLayout>{children}</ManageTeamsLayout>;
}
