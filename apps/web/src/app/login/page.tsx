import AuthLoginPage from '@/features/auth/AuthLoginPage';
import AuthCentralEntry from '@/features/auth/components/login/AuthCentralEntry';
import { connection } from 'next/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  if (process.env.APLYD_APEX_LOGIN_ONLY === 'true') {
    const params = await searchParams;
    return <AuthCentralEntry failed={!!params.error} />;
  }
  return <AuthLoginPage />;
}
