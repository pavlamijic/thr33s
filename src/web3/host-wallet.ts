// Polkadot host (dot.li / paseo.li web, polkadot-desktop, Polkadot app)
// integration via the maintained @parity product-sdk.
//
// thr33s is Proof-of-Personhood-only: the single signing identity is the
// product account derived for this app's DotNS name. `SignerManager.connect()`
// (with the `productAccount` option) does three things we previously hand-rolled
// and got wrong:
//   1. the legacy-accounts handshake that wires up the mobile host's signing
//      transport (without it, prompts never reach the paired device and the
//      submit spinner hangs forever);
//   2. the host `ChainSubmit` permission request (without it the host silently
//      rejects every signing request);
//   3. populating the account `name` from the user's PoP username
//      (getUserId().primaryUsername, e.g. "daemiadot").
//
// Reference: paritytech/dotli-starter src/main.js + @parity/product-sdk-signer.

import { getHostProvider, isInsideContainerSync } from '@parity/product-sdk-host';
import { SignerManager, type SignerAccount } from '@parity/product-sdk-signer';
import { CONFIG } from './config';

export { getHostProvider };

export interface HostAccount {
  /** SS58 address (generic prefix 42). */
  address: string;
  /** H160 EVM address — the pallet-revive / leaderboard contract identity. */
  h160Address: string;
  /** PoP username (e.g. "daemiadot") when the host surfaced one, else null. */
  name: string | null;
  publicKey: Uint8Array;
}

// The dotli host binds each product to a DotNS identifier; signing fails with
// PermissionDenied if the signer's identifier doesn't match the URL the host
// loaded. Derive it from the URL so the same build works under localhost,
// `<name>.dot`, `<name>.dot.li`, `<name>.paseo.li`, and `<sub>.<name>` previews.
// Ported from dotli-starter's deriveSelfDotNs().
export function deriveSelfDotNs(): string {
  if (typeof window === 'undefined') return CONFIG.appDotNs;
  const hostname = window.location.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  ) {
    return CONFIG.appDotNs;
  }
  if (hostname.endsWith('.dot')) {
    const segments = hostname.split('.');
    return segments.length > 2 ? segments.slice(-2).join('.') : hostname;
  }
  // Gateway form: <label...>.<gateway-tld> e.g. playthrees33.paseo.li → playthrees33.dot
  const segments = hostname.split('.');
  if (segments.length >= 3) {
    let label = segments.slice(0, -2);
    if (label[label.length - 1] === 'app') label = label.slice(0, -1);
    if (label.length > 0) return `${label.join('.')}.dot`;
  }
  return CONFIG.appDotNs;
}

export const SELF_DOTNS = deriveSelfDotNs();

// Single shared SignerManager. `connect()` establishes the host session
// (legacy-accounts handshake) and requests the `ChainSubmit` permission by
// default; we then resolve our app-scoped product account via
// `getProductAccount(SELF_DOTNS)`, whose `name` is the user's PoP username.
export const signerManager = new SignerManager({
  ss58Prefix: 42,
  dappName: 'thr33s',
});

// Sync host detection for UI rendering (labels, gating). The SDK's async
// `isInsideContainer()` is authoritative; this mirrors its heuristic
// (desktop sets __HOST_WEBVIEW_MARK__, web loads us in an iframe).
export function isInHost(): boolean {
  try {
    return isInsideContainerSync();
  } catch {
    if (typeof window === 'undefined') return false;
    if ((window as { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) return true;
    try {
      return window !== window.top;
    } catch {
      return true; // cross-origin iframe access throws → we're in a host
    }
  }
}

function toHostAccount(account: SignerAccount): HostAccount {
  return {
    address: account.address,
    h160Address: account.h160Address,
    name: account.name,
    publicKey: account.publicKey,
  };
}

// Resolve this app's product account (must be called after a successful
// connect()). `name` is the user's PoP username, populated best-effort by the
// SDK from getUserId().primaryUsername.
async function resolveProductAccount(): Promise<HostAccount | null> {
  const res = await signerManager.getProductAccount(SELF_DOTNS, 0);
  if (!res.ok) {
    console.warn('[host] getProductAccount failed:', res.error);
    return null;
  }
  return toHostAccount(res.value);
}

// Connect to the host and resolve the product account. Returns null when not
// in a host, or when the host has no active session yet (user not signed in).
export async function connectHost(): Promise<HostAccount | null> {
  try {
    const result = await signerManager.connect();
    if (!result.ok) {
      console.warn('[host] SignerManager.connect failed:', result.error);
      return null;
    }
    const account = await resolveProductAccount();
    if (account) console.log('[host] connected:', account.name ?? account.address);
    return account;
  } catch (error) {
    console.warn('[host] connectHost threw:', error);
    return null;
  }
}

// Subscribe to host connection-status changes so a sign-in that happens after
// our initial attempt (e.g. user signs in via the topbar) is picked up. Only
// acts on transitions to avoid re-firing on every state mutation while
// connected.
export function subscribeHostConnection(
  onConnect: (account: HostAccount) => void,
  onDisconnect: () => void,
): () => void {
  let lastStatus: string | null = null;
  return signerManager.subscribe((state) => {
    if (state.status === lastStatus) return;
    lastStatus = state.status;
    if (state.status === 'connected') {
      void resolveProductAccount().then((account) => {
        if (account) onConnect(account);
      });
    } else if (state.status === 'disconnected') {
      onDisconnect();
    }
  });
}

export function truncateAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
