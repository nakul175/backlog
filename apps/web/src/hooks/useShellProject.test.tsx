import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { JSDOM } from 'jsdom';
import { SyncProvider } from '@/context/syncContext';
import { qk } from '@/services/queryKeys';
import { useShellProject } from './useShellProject';

const globals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let dom: JSDOM;
let root: Root;
let client: QueryClient;
let status: number;
let role: 'owner' | 'member';
let latest: ReturnType<typeof useShellProject>;
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const project = {
  id: 17,
  ref: 'team.TEST',
  key: 'TEST',
  cyclesEnabled: false,
  subtasksEnabled: false,
};
function scaffold() {
  return {
    project,
    viewer: { role, via: 'member', teamRole: 'member' },
    permissions: { work_items: { read: true, create: role === 'owner' }, views: { read: true } },
    columns: [],
    issueTypes: [],
    labels: [],
    labelGroups: [],
    assignees: [],
    customFields: [],
    issueTemplates: [],
  };
}
function ShellProbe() {
  latest = useShellProject('team.TEST', null);
  return <div>{latest.project?.viewer.role ?? 'no access'}</div>;
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
async function marker(value: string) {
  await act(async () => {
    client.setQueryData(['sync', 'rev', ['access:17']], { revs: { 'access:17': value } });
  });
  await settle();
  await settle();
}

beforeEach(async () => {
  originals = new Map(
    globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/team/TEST' });
  for (const key of globals) {
    if (key in dom.window)
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: dom.window[key as keyof typeof dom.window],
      });
  }
  status = 200;
  role = 'owner';
  Object.defineProperties(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    fetch: {
      configurable: true,
      value: async (url: string) => {
        const pathname = new URL(url).pathname;
        if (pathname === '/projects/team.TEST')
          return Response.json(status === 200 ? scaffold() : { error: 'Denied' }, { status });
        if (pathname.endsWith('/board')) return Response.json({ issues: [], rev: '0' });
        if (pathname === '/sync/rev') return Response.json({ revs: { 'access:17': 'owner' } });
        return Response.json([]);
      },
    },
  });
  Object.defineProperty(window, '__ITSAPLAN_ENV__', {
    value: { apiUrl: 'https://example.test', privacyUrl: '', termsUrl: '' },
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(qk.projects, [project]);
  client.setQueryData(qk.project('team.TEST'), scaffold());
  client.setQueryData(qk.boardIssues('team.TEST'), { issues: [], rev: '0' });
  client.setQueryData(qk.views('team.TEST'), []);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('root')!);
  await act(async () =>
    root.render(
      <AppRouterContext.Provider value={router as never}>
        <QueryClientProvider client={client}>
          <SyncProvider>
            <ShellProbe />
          </SyncProvider>
        </QueryClientProvider>
      </AppRouterContext.Provider>,
    ),
  );
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  dom.window.close();
  for (const [key, value] of originals) {
    if (value) Object.defineProperty(globalThis, key, value);
    else Reflect.deleteProperty(globalThis, key);
  }
});
describe('open project access refresh', () => {
  it('removes owner actions after downgrade without remounting', async () => {
    assert.equal(latest.canCreateIssue, true);
    role = 'member';
    await marker('reader');
    assert.equal(latest.project?.viewer.role, 'member');
    assert.equal(latest.canCreateIssue, false);
  });
  it('drops cached authority on revoke and recovers after regrant in the same mounted shell', async () => {
    status = 403;
    await marker('0');
    assert.equal(latest.project === null, true);
    assert.equal(latest.canCreateIssue, false);
    assert.equal(latest.forbidden, true);
    assert.equal(client.getQueryData(qk.project('team.TEST')) != null, true);
    status = 200;
    role = 'member';
    await marker('reader');
    assert.equal(latest.project?.viewer.role, 'member');
    assert.equal(latest.canCreateIssue, false);
  });
  it('does not retain cached authority after a failed permission read', async () => {
    status = 503;
    await marker('changed');
    assert.equal(latest.project === null, true);
    assert.equal(latest.canCreateIssue, false);
  });
});
