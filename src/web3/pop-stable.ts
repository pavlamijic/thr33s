// Resolves PoP-attested usernames from the pop_stable chain.
//
// Two entry points:
//   - getPopNameForSs58 — direct lookup when we already hold an SS58 address
//     (e.g. the currently-connected Substrate wallet).
//   - getPopNameForEvm — reverse-maps the EVM address via
//     pallet_revive.OriginalAccount on Paseo Asset Hub first, then queries
//     pop_stable. Used for leaderboard rows, which store EVM addresses only.
//
// Query shape is copied from tick3t's `fetchUsername`:
//   apps/w3s/app/stores/wallet.ts (commit c6548b6)
//   Resources.Consumers.getValue(ss58) → { lite_username: Bytes }
//
// Session-cached to avoid re-querying the same address on every render.

import { createClient } from 'polkadot-api';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { getWsProvider } from 'polkadot-api/ws-provider/web';
import { isAddress, type Address } from 'viem';
import { polkadotClient } from './client';
import { CONFIG } from './config';

// Cache keys: SS58 strings OR lowercased EVM hex strings.
const nameCache = new Map<string, string | null>();

let popClient: ReturnType<typeof createClient> | null = null;
let popApi: any = null;
let popConnectPromise: Promise<any> | null = null;

async function connectPop(): Promise<any> {
  if (popApi) return popApi;
  if (popConnectPromise) return popConnectPromise;

  popConnectPromise = (async () => {
    console.log('[pop-stable] connecting to', CONFIG.popStableRpcEndpoint);
    const provider = getWsProvider(CONFIG.popStableRpcEndpoint);
    popClient = createClient(withPolkadotSdkCompat(provider));
    popApi = popClient.getUnsafeApi();
    console.log('[pop-stable] client created');
    return popApi;
  })();

  return popConnectPromise;
}

// pop_stable returns a struct whose `lite_username` field may be exposed as a
// Binary with .asText(), a plain Uint8Array, or a utf-8 string depending on
// the papi codegen path. Normalise.
function decodeLiteUsername(raw: unknown): string | null {
  if (!raw) return null;
  const asAny = raw as any;
  if (typeof asAny.asText === 'function') {
    try {
      const txt = asAny.asText();
      return typeof txt === 'string' && txt.length > 0 ? txt : null;
    } catch {
      // fall through to other branches
    }
  }
  if (typeof asAny === 'string') return asAny.length > 0 ? asAny : null;
  if (asAny instanceof Uint8Array) {
    try {
      const txt = new TextDecoder('utf-8', { fatal: false }).decode(asAny);
      return txt.length > 0 ? txt : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchLiteUsername(ss58Address: string): Promise<string | null> {
  try {
    const api = await connectPop();
    console.log('[pop-stable] querying Resources.Consumers for', ss58Address);
    const result = await api.query.Resources.Consumers.getValue(ss58Address);
    console.log('[pop-stable] Resources.Consumers result:', result);
    if (!result) return null;
    const asAny = result as any;
    // Try a few known field shapes. Metadata exposes snake_case but some
    // papi paths normalise to camelCase.
    const raw =
      asAny.lite_username ??
      asAny.liteUsername ??
      asAny.value?.lite_username ??
      asAny.value?.liteUsername;
    const decoded = decodeLiteUsername(raw);
    console.log('[pop-stable] decoded lite_username:', decoded);
    return decoded;
  } catch (error) {
    console.warn('[pop-stable] lite_username fetch failed:', error);
    return null;
  }
}

export async function getPopNameForSs58(ss58Address: string): Promise<string | null> {
  if (!ss58Address) return null;
  if (nameCache.has(ss58Address)) return nameCache.get(ss58Address)!;
  const name = await fetchLiteUsername(ss58Address);
  nameCache.set(ss58Address, name);
  return name;
}

export async function getPopNameForEvm(evmAddress: string): Promise<string | null> {
  if (!isAddress(evmAddress)) return null;
  const key = evmAddress.toLowerCase();
  if (nameCache.has(key)) return nameCache.get(key)!;

  const ss58 = await polkadotClient.getSubstrateAddressForEvm(evmAddress as Address);
  console.log('[pop-stable] evm→ss58', evmAddress, '→', ss58);
  if (!ss58) {
    nameCache.set(key, null);
    return null;
  }

  const name = await getPopNameForSs58(ss58);
  // Cache under both the EVM key and the SS58 key so subsequent lookups via
  // either address skip the round-trip.
  nameCache.set(key, name);
  return name;
}

// Dispatches on address format. Accepts either an EVM 0x address or SS58.
export async function getPopName(address: string): Promise<string | null> {
  if (!address) return null;
  return isAddress(address) ? getPopNameForEvm(address) : getPopNameForSs58(address);
}

export function truncateAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Display name resolution for UI. Returns the PoP name if attested, else the
// truncated address. Use `getPopName` directly if you need to distinguish
// "no PoP entry" from "attested but empty".
export async function getDisplayName(address: string): Promise<string> {
  const name = await getPopName(address);
  return name ?? truncateAddress(address);
}
