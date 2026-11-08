import Image from 'next/image';
import { APP_BRAND } from '@/utils/app';

export default function BrandPanel({ subtitle: _subtitle }: { subtitle?: string }) {
  return (
    <div className="relative hidden items-center justify-center bg-white p-8 md:flex">
      <Image
        src="/brand/mascot.png"
        alt=""
        width={1280}
        height={1280}
        priority
        unoptimized
        className="h-auto w-2/5 max-w-56"
      />
      <p className="text-3xl font-bold text-slate-950">{APP_BRAND}</p>
      <a href="/source.tar.gz" className="absolute bottom-4 text-xs text-slate-500 underline">
        Source code
      </a>
    </div>
  );
}
