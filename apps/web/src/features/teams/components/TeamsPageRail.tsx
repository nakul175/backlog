import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// One rail of TeamsPageView. The caller sets its width.
export default function TeamsPageRail({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-b p-3 lg:overflow-y-auto lg:border-e lg:border-b-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
