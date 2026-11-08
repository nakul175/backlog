import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { JSDOM } from 'jsdom';
import { ShellCtx, type ShellContext } from '@/context/shellContext';
import members from '../../../messages/en/members.json';
import common from '../../../messages/en/common.json';

const globals = [
  'window',
  'document',
  'navigator',
  'Node',
  'DocumentFragment',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLFormElement',
  'SVGElement',
  'Event',
  'CustomEvent',
  'NodeFilter',
  'MutationObserver',
  'getComputedStyle',
  'localStorage',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let dom: JSDOM;
let root: Root;
let client: QueryClient;

beforeEach(async () => {
  originals = new Map(globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://example.test/team/TEST/members',
  });
  for (const k of globals)
    if (k in dom.window)
      Object.defineProperty(globalThis, k, {
        configurable: true,
        value: dom.window[k as keyof typeof dom.window],
      });
  Object.defineProperty(dom.window, '__ITSAPLAN_ENV__', {
    value: { apiUrl: 'http://api.test', privacyUrl: '', termsUrl: '' },
  });
  Object.defineProperties(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
    getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
    fetch: {
      configurable: true,
      value: async (input: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(input).includes('get-session') ? { user: { id: 'synthetic' } } : [],
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  dom.window.close();
  for (const [k, v] of originals)
    if (v) Object.defineProperty(globalThis, k, v);
    else Reflect.deleteProperty(globalThis, k);
});

async function render(role: 'manager' | 'member', inviteOnly = false) {
  const { default: MembersPage } = await import('./MembersPage');
  const context = {
    project: {
      project: { id: 1, ref: 'team.TEST', name: 'Synthetic project', teamId: 2, teamName: 'Team' },
      viewer: { role: 'member', teamRole: role, via: 'member' },
      permissions: { members_manage: {}, members_invite: { create: inviteOnly } },
    },
  } as unknown as ShellContext;
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ members, common }} timeZone="UTC">
          <AppRouterContext.Provider
            value={{
              bfcacheId: 'synthetic',
              push() {},
              replace() {},
              refresh() {},
              back() {},
              forward() {},
              prefetch() {},
            }}
          >
            <ShellCtx.Provider value={context}>
              <MembersPage />
            </ShellCtx.Provider>
          </AppRouterContext.Provider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ),
  );
}

async function open() {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes('Add member'),
  );
  assert.ok(button);
  await act(async () => button.click());
  assert.ok(document.querySelector('[role="dialog"]'));
}

describe('MembersPage current authority', () => {
  it('discards an open dialog on downgrade and does not reopen it after regrant', async () => {
    await render('manager');
    await open();
    await render('member');
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await render('manager');
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await open();
  });
  it('discards old selections when reduced to invitation-only authority', async () => {
    await render('manager');
    await open();
    await render('member', true);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await open();
  });
});
