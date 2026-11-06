import { cn } from '@/lib/utils';
import { SECTION_COLUMN_CLASS } from '@/components/common/page/SectionPageView';
import PageSkeleton from './PageSkeleton';

// Stands in for a section page: the column and padding SectionPageView renders in,
// so the loaded section lands where the skeleton was.
export default function SectionPageSkeleton({ rows }: { rows?: number }) {
  return (
    <PageSkeleton
      rows={rows}
      className={cn('mx-0 px-4 pt-5 pb-4 sm:px-6 lg:px-8', SECTION_COLUMN_CLASS)}
    />
  );
}
