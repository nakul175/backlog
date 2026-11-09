import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import * as authService from '../../services/auth.service';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { JSDOM } from 'jsdom';
import auth from '../../../../../messages/en/auth.json';

const replacedGlobals = [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLFormElement',
  'SVGElement',
  'Event',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'localStorage',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

let dom: JSDOM;
let root: Root;
let originals: Map<string, PropertyDescriptor | undefined>;
const originalAuthService = { ...authService };
let attempts: { returnTo?: string; signal?: AbortSignal }[];

async function render(failed = false) {
  const { default: AuthCentralEntry } = await import('./AuthCentralEntry');
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={{ auth }} timeZone="UTC">
        <AuthCentralEntry failed={failed} />
      </NextIntlClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

beforeEach(async () => {
  attempts = [];
  mock.module('../../services/auth.service', () => ({
    ...originalAuthService,
    signInWithOidc: async (returnTo?: string, signal?: AbortSignal) => {
      attempts.push({ returnTo, signal });
    },
  }));
  originals = new Map(
    replacedGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'https://example.test/login',
    pretendToBeVisual: true,
  });
  for (const name of replacedGlobals) {
    if (name in dom.window) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: dom.window[name as keyof typeof dom.window],
      });
    }
  }
  Object.defineProperties(globalThis, {
    getComputedStyle: { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  Object.defineProperty(window, '__ITSAPLAN_ENV__', {
    value: { apiUrl: 'https://example.test', privacyUrl: '', termsUrl: '' },
  });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.querySelector('#root')!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  mock.module('../../services/auth.service', () => originalAuthService);
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

describe('AuthCentralEntry', () => {
  it('starts only OIDC, without native credential or registration fields', async () => {
    await render();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].returnTo, undefined);
    assert.equal(document.querySelector('input'), null);
    assert.equal(document.querySelector('a[href="/register"]'), null);
  });
  it('does not automatically repeat a failed callback', async () => {
    await render(true);
    assert.equal(attempts.length, 0);
    assert.ok(document.querySelector('button'));
    await act(async () => {
      document.querySelector('button')!.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(attempts.length, 1);
  });
  it('cancels the outstanding sign-in attempt when the page unmounts', async () => {
    await render();
    const signal = attempts[0].signal;
    assert.ok(signal);
    assert.equal(signal.aborted, false);
    await act(async () => root.unmount());
    assert.equal(signal.aborted, true);
  });
});
