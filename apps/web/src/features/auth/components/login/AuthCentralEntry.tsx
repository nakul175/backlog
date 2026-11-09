'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { signInWithOidc } from '../../services/auth.service';

export default function AuthCentralEntry({ failed }: { failed: boolean }) {
  const t = useTranslations('auth');
  const [attempt, setAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(failed);
  useEffect(() => {
    if (failed && attempt === 0) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) setUnavailable(true);
    }, 10000);
    void signInWithOidc(undefined, controller.signal).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [failed, attempt]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <p role="status">{unavailable ? t('errors.generic') : t('login.submitPending')}</p>
      {unavailable && (
        <Button
          onClick={() => {
            setUnavailable(false);
            setAttempt((value) => value + 1);
          }}
        >
          {t('login.withSso')}
        </Button>
      )}
    </main>
  );
}
