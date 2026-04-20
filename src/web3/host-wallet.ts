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
  hostApi,
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
  // Host-surfaced PoP-attested alias ("daemia.99" etc.) if the host's
  // `getProductAccountAlias` call resolved. Null when the host didn't
  // provide one — caller falls back to pop_stable lookup or truncated
  // address.
  alias: string | null;
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

function toHostAccount(raw: { publicKey: Uint8Array; name: string | undefined }): HostAccount {
  // The SDK's signer only uses `publicKey` at runtime, but TypeScript
  // requires the full ProductAccount shape — fake the rest.
  const productAccount: ProductAccount = {
    publicKey: raw.publicKey,
    dotNsIdentifier: '',
    derivationIndex: 0,
  };
  const rawName = raw.name?.trim() || null;
  return {
    address: accountIdCodec.dec(raw.publicKey),
    name: rawName || 'Account',
    publicKey: raw.publicKey,
    // `getNonProductAccountSigner` matches dotli-starter's pattern — works
    // with both PoP and pre-PoP accounts returned from `getNonProductAccounts`.
    signer: accountsProvider.getNonProductAccountSigner(productAccount),
    // The host populates `name` with the user's PoP handle (e.g. "daemia.99")
    // when available, so reuse it as the alias displayed on the wallet button.
    alias: rawName,
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
// Placeholder — product-sdk 0.6.x has no `requestLogin` API. Callers should
// fall back to the passive-wait pattern (show 'sign in via topbar' modal,
// subscribe to connection status). Kept as a stub for when the SDK lands
// a stable trigger-sign-in method.
export async function requestHostLogin(_reason?: string): Promise<boolean> {
  return false;
}

// dot.li auto-denies every signing request until the dApp explicitly asks
// for a `TransactionSubmit` permission (SigningErr::PermissionDenied is the
// observable symptom). Granted permissions are persisted, so calling this
// once per session is enough. Return true on success.
export async function requestTransactionSubmitPermission(): Promise<boolean> {
  try {
    console.log('[host] requesting TransactionSubmit permission');
    const result = await hostApi.permission({
      tag: 'v1',
      value: { tag: 'TransactionSubmit', value: undefined },
    } as Parameters<typeof hostApi.permission>[0]);
    if (result.isErr()) {
      console.warn('[host] TransactionSubmit permission request errored:', result.error);
      return false;
    }
    const granted = (result.value as any).value === true;
    console.log('[host] TransactionSubmit permission →', granted);
    return granted;
  } catch (error) {
    console.warn('[host] TransactionSubmit permission threw:', error);
    return false;
  }
}

// Account-fetch calls can silently hang when the host can't fulfil them
// (e.g. user in the wrong auth state for the API being called). Race with
// a short timeout so the UI can move on and try the next strategy. dot.li's
// first call can be slow (sandbox handshake), so be generous.
const GET_ACCOUNTS_TIMEOUT_MS = 15_000;

const timeoutSentinel = Symbol('timeout');

function raceWithTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | typeof timeoutSentinel> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<typeof timeoutSentinel>((resolve) => setTimeout(() => resolve(timeoutSentinel), ms)),
  ]);
}

// Canonical dot.li pattern (copied from `refs/dotli-starter/src/main.js`):
// call `getNonProductAccounts()` to get the user's real account, including
// the PoP handle in the `name` field (e.g. "daemia.99"). t3rminal's
// `getProductAccount` path gave us a per-dApp derived sub-account with no
// name — wrong template for this host.
export async function connectToHost(): Promise<HostAccount | null> {
  try {
    console.log('[host] connectToHost: injecting spektr extension');
    const injected = await injectSpektrExtension();
    console.log('[host] connectToHost: injectSpektrExtension →', injected);
    if (!injected) return null;

    console.log('[host] connectToHost: fetching non-product accounts');
    const result = await raceWithTimeout(
      accountsProvider.getNonProductAccounts(),
      GET_ACCOUNTS_TIMEOUT_MS,
    );

    if (result === timeoutSentinel) {
      console.log('[host] connectToHost: getNonProductAccounts timed out');
      return null;
    }
    if (!result.isOk()) {
      console.warn('[host] getNonProductAccounts failed:', result.error);
      return null;
    }
    const raw = result.value;
    console.log(
      '[host] connectToHost: got',
      raw.length,
      'account(s); first name=',
      JSON.stringify(raw[0]?.name),
    );
    if (raw.length === 0) return null;

    return toHostAccount(raw[0]);
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
