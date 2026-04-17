// Polkadot Desktop / trUI host integration.
//
// When thr33s runs as a `.dot` app inside Polkadot Desktop, the host injects
// a Spektr-compatible extension that exposes the user's already-unlocked
// Polkadot account(s) via the standard `window.injectedWeb3` bridge. We
// detect that environment and connect through it so the user never has to
// click "Connect Wallet". On the public web (playthrees33.dot.li) the host
// isn't present, `connectToHost()` returns null, and the caller falls back
// to the existing wallet-extension picker.
//
// Pattern mirrors linktr33's `app_ext/src/wallet/host.ts`.

import {
  injectSpektrExtension,
  SpektrExtensionName,
} from '@novasamatech/product-sdk';
import {
  connectInjectedExtension,
  type InjectedExtension,
  type InjectedPolkadotAccount,
} from 'polkadot-api/pjs-signer';

declare global {
  interface Window {
    __HOST_WEBVIEW_MARK__?: boolean;
  }
}

export type HostEnvironment = 'desktop-webview' | 'web-iframe' | 'standalone';

export function detectHostEnvironment(): HostEnvironment {
  if (typeof window === 'undefined') return 'standalone';
  if (window.__HOST_WEBVIEW_MARK__) return 'desktop-webview';
  if (window.parent !== window) return 'web-iframe';
  return 'standalone';
}

export function isInHost(): boolean {
  return detectHostEnvironment() !== 'standalone';
}

export async function connectToHost(): Promise<InjectedExtension | null> {
  try {
    const success = await injectSpektrExtension();
    if (!success) return null;
    return await connectInjectedExtension(SpektrExtensionName);
  } catch (error) {
    console.warn('[host] Spektr connect failed:', error);
    return null;
  }
}

// The host may restore its session lazily (e.g. after requestIdleCallback),
// so an initial `getAccounts()` can return an empty list. Poll briefly.
export async function getHostAccountsWithRetry(
  extension: InjectedExtension,
  timeoutMs = 8_000,
  intervalMs = 250,
): Promise<InjectedPolkadotAccount[]> {
  const deadline = Date.now() + timeoutMs;
  let accounts = extension.getAccounts();
  while (accounts.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    accounts = extension.getAccounts();
  }
  return accounts;
}
