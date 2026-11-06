import Image from 'next/image';
import { APP_NAME } from '@/utils/app';

export default function BrandPanel({ subtitle: _subtitle }: { subtitle?: string }) {
  return (
    <div className="relative hidden items-center justify-center bg-white p-8 md:flex">
      <Image
        src="/brand/logo.png"
        alt={APP_NAME}
        width={1774}
        height={887}
        priority
        unoptimized
        className="h-auto w-full max-w-xl"
      />
      <a href="/source.tar.gz" className="absolute bottom-4 text-xs text-slate-500 underline">
        Source code
      </a>
    </div>
  );
}
