// Polkadot host (dot.li / paseo.li web, polkadot-desktop, Polkadot app)
// integration via @parity/product-sdk-host's low-level accounts provider —
// the dotli-starter pattern (src/main.js), NOT SignerManager.
//
// Why not SignerManager: its host provider throws NoAccountsError when the host
// returns zero *legacy* accounts. A Proof-of-Personhood-only user (e.g.
// "daemiadot") has no legacy wallet accounts — only a derivable product
// account — so SignerManager.connect() fails for exactly our users. The
// accounts-provider flow instead does a tolerant getLegacyAccounts() handshake
// (to wire up mobile-host signing), grants ChainSubmit, then derives the
// product account directly with getProductAccount().

import {
  getAccountsProvider,
  getTruApi,
  getHostProvider,
  isInsideContainer,
  isInsideContainerSync,
  requestResourceAllocation,
} from '@parity/product-sdk-host';
import { ss58ToH160 } from '@parity/product-sdk-address';
import { AccountId } from '@polkadot-api/substrate-bindings';
import type { PolkadotSigner } from 'polkadot-api';
import { CONFIG } from './config';

export { getHostProvider };

type AccountsProvider = NonNullable<Awaited<ReturnType<typeof getAccountsProvider>>>;

export interface HostAccount {
  /** SS58 address (generic prefix 42) — the caller origin for contract calls. */
  address: string;
  /** H160 EVM address — the pallet-revive / leaderboard contract identity. */
  h160Address: string;
  /** PoP username (e.g. "daemiadot"), if the host surfaced one. */
  name: string | null;
  publicKey: Uint8Array;
  /** Host signer for this account (routes through the host's tx-create path). */
  signer: PolkadotSigner;
}

const accountIdCodec = AccountId(42);

// Derive the app's DotNS identifier from the URL so the same build works under
// localhost, <name>.dot, <name>.dot.li, <name>.paseo.li and preview subnames.
// Ported from dotli-starter's deriveSelfDotNs().
export function deriveSelfDotNs(): string {
  if (typeof window === 'undefined') return CONFIG.appDotNs;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
    return CONFIG.appDotNs;
  }
  if (hostname.endsWith('.dot')) {
    const segments = hostname.split('.');
    return segments.length > 2 ? segments.slice(-2).join('.') : hostname;
  }
  const segments = hostname.split('.');
  if (segments.length >= 3) {
    let label = segments.slice(0, -2);
    if (label[label.length - 1] === 'app') label = label.slice(0, -1);
    if (label.length > 0) return `${label.join('.')}.dot`;
  }
  return CONFIG.appDotNs;
}

export const SELF_DOTNS = deriveSelfDotNs();

let providerPromise: Promise<AccountsProvider | null> | null = null;
function getProvider(): Promise<AccountsProvider | null> {
  if (!providerPromise) providerPromise = getAccountsProvider();
  return providerPromise;
}

export function isInHost(): boolean {
  try {
    return isInsideContainerSync();
  } catch {
    if (typeof window === 'undefined') return false;
    if ((window as { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) return true;
    try {
      return window !== window.top;
    } catch {
      return true;
    }
  }
}

// Grant the host ChainSubmit permission — without it the host silently rejects
// every signing request (and the mobile prompt never reaches the device).
async function requestChainSubmit(): Promise<void> {
  try {
    const truApi = await getTruApi();
    if (!truApi) return;
    const res = await truApi.permission({ tag: 'v1', value: { tag: 'ChainSubmit', value: undefined } });
    res.match(
      (r: { value: unknown }) => console.log('[host] ChainSubmit →', r.value),
      (e: { value?: { name?: string } }) => console.warn('[host] ChainSubmit failed:', e?.value?.name ?? e),
    );
  } catch (error) {
    console.warn('[host] ChainSubmit threw:', error);
  }
}

// Remember, per account, that we've already requested the allowance — so we
// don't re-prompt on every refresh. The on-chain grant (PGAS mint + account
// mapping + AsPgas sponsorship) persists, so a returning user is asked once.
const allowanceKey = (address: string) => `thr33s-allowance:${address}`;
function hasGrantedAllowance(address: string): boolean {
  try {
    return localStorage.getItem(allowanceKey(address)) === '1';
  } catch {
    return false;
  }
}
function markAllowanceGranted(address: string): void {
  try {
    localStorage.setItem(allowanceKey(address), '1');
  } catch {
    // ignore storage failures
  }
}

// Request the host to provision a SmartContract (PGAS) allowance. This is the
// step that maps a Proof-of-Personhood product account without any PAS funding:
// the host mints PGAS to the product account on Asset Hub, which creates +
// auto-maps it, and authorises the AsPgas fee extension so the leaderboard's
// Revive calls are gas-sponsored. AutoSigning lets the host sign without a
// prompt per move. Outcomes are advisory (NotAvailable is non-fatal — picked up
// once the host supports it). Mirrors festival's claimAllowances().
async function requestAllowances(): Promise<void> {
  try {
    const resources = [
      { tag: 'SmartContractAllowance', value: 0 },
      { tag: 'AutoSigning', value: undefined },
    ] as unknown as Parameters<typeof requestResourceAllocation>[0];
    const outcomes = await requestResourceAllocation(resources);
    outcomes?.forEach?.((o: { tag?: string }, i: number) =>
      console.log('[host] allocation', i, '→', o?.tag),
    );
  } catch (error) {
    console.warn('[host] requestResourceAllocation failed (ignored):', error);
  }
}

// Derive this app's product account (must be called once the host session is
// up). Returns null if the user isn't signed in / the host can't derive it.
async function fetchProductAccount(provider: AccountsProvider): Promise<HostAccount | null> {
  // Session handshake — tolerate zero legacy accounts (PoP-only users have none).
  try {
    await provider.getLegacyAccounts().match(
      (legacy: unknown[]) => console.log('[host] session ready, legacy accounts:', legacy.length),
      (e: unknown) => console.warn('[host] getLegacyAccounts failed (ignored):', e),
    );
  } catch (e) {
    console.warn('[host] getLegacyAccounts threw (ignored):', e);
  }

  let raw: { publicKey: Uint8Array; name?: string } | null = null;
  await provider.getProductAccount(SELF_DOTNS, 0).match(
    (account: { publicKey: Uint8Array; name?: string }) => {
      raw = account;
    },
    (e: { name?: string }) => console.warn('[host] getProductAccount failed:', e?.name ?? e),
  );
  if (!raw) return null;
  const account = raw as { publicKey: Uint8Array; name?: string };

  const signer = provider.getProductAccountSigner({
    dotNsIdentifier: SELF_DOTNS,
    derivationIndex: 0,
    publicKey: account.publicKey,
  });
  const address = accountIdCodec.dec(account.publicKey);
  const h160Address = ss58ToH160(address);

  // Provision the PGAS/SmartContract allowance once per account (then skip on
  // future loads), so the host doesn't pop the "Allowance request" dialog on
  // every refresh.
  if (!hasGrantedAllowance(address)) {
    await requestAllowances();
    markAllowanceGranted(address);
  }

  let name: string | null = account.name ?? null;
  try {
    const getUserId = (provider as { getUserId?: () => { match: (ok: (u: { primaryUsername?: string }) => void, err: (e: unknown) => void) => Promise<void> } }).getUserId;
    if (typeof getUserId === 'function') {
      await getUserId.call(provider).match(
        (u: { primaryUsername?: string }) => {
          if (u?.primaryUsername) name = u.primaryUsername;
        },
        () => {},
      );
    }
  } catch {
    // keep account.name fallback
  }

  console.log('[host] product account ready:', name ?? address);
  return { address, h160Address, name, publicKey: account.publicKey, signer };
}

// Connect to the host. Returns null when not in a host or the user isn't
// signed in. Requests ChainSubmit before deriving the account.
export async function connectHost(): Promise<HostAccount | null> {
  try {
    if (!(await isInsideContainer())) return null;
    const provider = await getProvider();
    if (!provider) {
      console.warn('[host] getAccountsProvider returned null');
      return null;
    }
    await requestChainSubmit();
    // The PGAS/SmartContract allowance is requested inside fetchProductAccount,
    // gated to once per account (no re-prompt on refresh).
    return await fetchProductAccount(provider);
  } catch (error) {
    console.warn('[host] connectHost threw:', error);
    return null;
  }
}

// Subscribe to host connection-status changes so a sign-in that lands after our
// initial attempt is picked up. Only acts on status transitions.
export function subscribeHostConnection(
  onConnect: (account: HostAccount) => void,
  onDisconnect: () => void,
): () => void {
  let unsub: () => void = () => {};
  let lastStatus: string | null = null;
  void getProvider().then((provider) => {
    if (!provider) return;
    const sub = provider.subscribeAccountConnectionStatus(async (status: string) => {
      if (status === lastStatus) return;
      lastStatus = status;
      if (status === 'connected') {
        const account = await fetchProductAccount(provider);
        if (account) onConnect(account);
      } else if (status === 'disconnected') {
        onDisconnect();
      }
    });
    unsub =
      typeof sub === 'function'
        ? sub
        : sub && typeof (sub as { unsubscribe?: () => void }).unsubscribe === 'function'
          ? () => (sub as { unsubscribe: () => void }).unsubscribe()
          : () => {};
  });
  return () => unsub();
}

export function truncateAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
