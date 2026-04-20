// Polkadot Desktop / trUI / dot.li host integration.
//
// When thr33s runs inside a Polkadot "Triangle" host — polkadot-desktop as
// `playthrees33.dot`, or dot.li as `playthrees33.dot.li` — the host exposes
// the user's logged-in account via `@novasamatech/product-sdk`. We read it
// through the SDK's AccountsProvider (NOT through the injectedWeb3 / pjs
// bridge — that path only works inside the Electron webview, not inside
// dot.li's cross-origin iframe).
//
// Detection mirrors ignite's `isInTriangleHost()` and the SDK's own internal
// transport selection: `window.__HOST_WEBVIEW_MARK__` (desktop/mobile), or
// any iframe (dot.li). `injectSpektrExtension()` returning true is the
// definitive confirmation — it's also what sets up the SDK's sandbox
// transport for everything else to work.
//
// Pattern copied from:
//   refs/ignite/src/contexts/WalletContext.tsx
//   refs/ignite/src/lib/triangle/hostDetection.ts

import {
  createAccountsProvider,
  injectSpektrExtension,
  sandboxProvider,
  type ProductAccount,
} from '@novasamatech/product-sdk';
import { AccountId, type PolkadotSigner } from 'polkadot-api';

declare global {
  interface Window {
    __HOST_WEBVIEW_MARK__?: boolean;
  }
}

export type HostEnvironment = 'desktop-webview' | 'web-iframe' | 'standalone';

export interface HostAccount {
  address: string;
  name: string;
  publicKey: Uint8Array;
  signer: PolkadotSigner;
}

export function detectHostEnvironment(): HostEnvironment {
  if (typeof window === 'undefined') return 'standalone';
  if (window.__HOST_WEBVIEW_MARK__) return 'desktop-webview';
  try {
    if (window !== window.top) return 'web-iframe';
  } catch {
    // Cross-origin iframe — the comparison throws; still a host.
    return 'web-iframe';
  }
  return 'standalone';
}

// Canonical detection used by the product-sdk itself. The hand-rolled
// checks above can miss edge cases (e.g. dot.li's `document.write()` path
// that re-anchors the window), so prefer this when available.
export function isInHost(): boolean {
  try {
    if (sandboxProvider.isCorrectEnvironment()) return true;
  } catch {
    // fall through to heuristic
  }
  return detectHostEnvironment() !== 'standalone';
}

// Shared by all callers so the SDK only spins up one sandbox transport.
const accountsProvider = createAccountsProvider();
const accountIdCodec = AccountId();

// dot.li / DotNS identifier for thr33s. Must match what we registered via
// the deploy workflow, otherwise `getProductAccount` returns empty for the
// signed-in user.
const THR33S_DOTNS_ID = 'playthrees33.dot';
const THR33S_DERIVATION_INDEX = 0;

function toProductHostAccount(
  raw: { publicKey: Uint8Array; name: string | undefined },
  dotNsIdentifier: string,
  derivationIndex: number,
): HostAccount {
  const productAccount: ProductAccount = {
    publicKey: raw.publicKey,
    dotNsIdentifier,
    derivationIndex,
  };
  return {
    address: accountIdCodec.dec(raw.publicKey),
    name: raw.name || 'Account',
    publicKey: raw.publicKey,
    signer: accountsProvider.getProductAccountSigner(productAccount),
  };
}

function toLegacyHostAccount(raw: { publicKey: Uint8Array; name: string | undefined }): HostAccount {
  const productAccount: ProductAccount = {
    publicKey: raw.publicKey,
    dotNsIdentifier: '',
    derivationIndex: 0,
  };
  return {
    address: accountIdCodec.dec(raw.publicKey),
    name: raw.name || 'Account',
    publicKey: raw.publicKey,
    signer: accountsProvider.getLegacyAccountSigner(productAccount),
  };
}

// One-shot connect. Returns the first logged-in host account, or null when:
//   - not in a host,
//   - `injectSpektrExtension()` reports false (the SDK couldn't handshake),
//   - the host has no active session (user hasn't signed in yet).
//
// For the "user signs in after the page loaded" case the caller should
// `subscribeHostConnection` and re-call this when the status flips to
// `connected`.
// Prompt the host (dot.li topbar / polkadot-desktop) to sign the user in,
// e.g. via the Polkadot app QR flow. Returns true if the user signed in or
// was already signed in, false if they rejected or the flow failed. The
// caller should follow up with `connectToHost()` (or rely on the existing
// `subscribeAccountConnectionStatus` subscription) to pick up the account.
export async function requestHostLogin(reason?: string): Promise<boolean> {
  try {
    const result = await accountsProvider.requestLogin(reason);
    if (!result.isOk()) {
      console.warn('[host] requestLogin failed:', result.error);
      return false;
    }
    const status = result.value;
    return status === 'success' || status === 'alreadyConnected';
  } catch (error) {
    console.warn('[host] requestLogin threw:', error);
    return false;
  }
}

// Account-fetch calls can silently hang when the host can't fulfil them
// (e.g. user in the wrong auth state for the API being called). Race with
// a short timeout so the UI can move on and try the next strategy.
const GET_ACCOUNTS_TIMEOUT_MS = 3_000;

const timeoutSentinel = Symbol('timeout');

function raceWithTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof timeoutSentinel> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<typeof timeoutSentinel>((resolve) => setTimeout(() => resolve(timeoutSentinel), ms)),
  ]);
}

// For Polkadot-app / dot.li users, the canonical API is
// `getProductAccount(dotNsIdentifier, derivationIndex)` — it returns a
// deterministic sub-account of the user's root identity, derived per
// dApp. Pattern copied from `refs/t3rminal/lib/host/accounts.ts`, which
// is the only shipping app we've found where the account flow actually
// works end-to-end with a signed-in Polkadot-app user. `getRootAccount`
// and `getLegacyAccounts` appear to hang on the current dot.li build.
// Timeout fallbacks remain in place as a safety net.
export async function connectToHost(): Promise<HostAccount | null> {
  try {
    console.log('[host] connectToHost: injecting spektr extension');
    const injected = await injectSpektrExtension();
    console.log('[host] connectToHost: injectSpektrExtension →', injected);
    if (!injected) return null;

    console.log(
      '[host] connectToHost: fetching product account',
      THR33S_DOTNS_ID,
      '#',
      THR33S_DERIVATION_INDEX,
    );
    const productResult = await raceWithTimeout(
      accountsProvider.getProductAccount(THR33S_DOTNS_ID, THR33S_DERIVATION_INDEX),
      GET_ACCOUNTS_TIMEOUT_MS,
    );

    if (productResult === timeoutSentinel) {
      console.log('[host] connectToHost: getProductAccount timed out');
    } else if (!productResult.isOk()) {
      console.warn('[host] getProductAccount failed:', productResult.error);
    } else {
      console.log('[host] connectToHost: got product account', productResult.value.name);
      return toProductHostAccount(productResult.value, THR33S_DOTNS_ID, THR33S_DERIVATION_INDEX);
    }

    console.log('[host] connectToHost: falling back to root account');
    const rootResult = await raceWithTimeout(
      accountsProvider.getRootAccount(),
      GET_ACCOUNTS_TIMEOUT_MS,
    );

    if (rootResult === timeoutSentinel) {
      console.log('[host] connectToHost: getRootAccount timed out');
    } else if (!rootResult.isOk()) {
      console.warn('[host] getRootAccount failed:', rootResult.error);
    } else {
      console.log('[host] connectToHost: got root account', rootResult.value.name);
      return toLegacyHostAccount(rootResult.value);
    }

    console.log('[host] connectToHost: falling back to legacy accounts');
    const legacyResult = await raceWithTimeout(
      accountsProvider.getLegacyAccounts(),
      GET_ACCOUNTS_TIMEOUT_MS,
    );

    if (legacyResult === timeoutSentinel) {
      console.log('[host] connectToHost: getLegacyAccounts timed out');
      return null;
    }
    if (!legacyResult.isOk()) {
      console.warn('[host] getLegacyAccounts failed:', legacyResult.error);
      return null;
    }
    const raw = legacyResult.value;
    console.log('[host] connectToHost: got', raw.length, 'legacy accounts');
    if (raw.length === 0) return null;

    return toLegacyHostAccount(raw[0]);
  } catch (error) {
    console.warn('[host] connectToHost threw:', error);
    return null;
  }
}

// Subscribes to the host's account-connection status so we can pick up a
// sign-in that happens after our initial attempt. `onConnect` fires with the
// first account whenever the host transitions to connected and has accounts;
// `onDisconnect` fires when the host logs out.
export function subscribeHostConnection(
  onConnect: (account: HostAccount) => void,
  onDisconnect: () => void,
): () => void {
  const subscription = accountsProvider.subscribeAccountConnectionStatus(async (status) => {
    if (status === 'disconnected') {
      onDisconnect();
      return;
    }
    if (status === 'connected') {
      try {
        const account = await connectToHost();
        if (account) onConnect(account);
      } catch (error) {
        console.warn('[host] re-fetch on reconnect failed:', error);
      }
    }
  });

  return () => {
    try {
      subscription.unsubscribe?.();
    } catch {
      // best-effort cleanup
    }
  };
}
