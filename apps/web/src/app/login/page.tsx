import AuthLoginPage from '@/features/auth/AuthLoginPage';
import AuthCentralEntry from '@/features/auth/components/login/AuthCentralEntry';
import { connection } from 'next/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  if (process.env.APLYD_APEX_LOGIN_ONLY === 'true' || params.central === '1') {
    return <AuthCentralEntry failed={!!params.error} />;
  }
  return <AuthLoginPage />;
}
