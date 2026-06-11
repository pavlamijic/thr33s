// PAPI v2 client + leaderboard contract handle.
//
// All pallet-revive interaction (dry-run reads + signed writes + account
// mapping) is delegated to @parity/product-sdk-contracts, which encodes the
// viem ABI, dry-runs via ReviveApi.call, and submits Revive.call. The signer
// and caller origin are resolved from the shared SignerManager at call time.
//
// Inside a host, RPC is routed through the sandbox via getHostProvider(genesis).
// Standalone (plain browser) we connect directly to the WS endpoint, which is
// enough for read-only leaderboard viewing (signing requires a host).

import { createClient, type PolkadotClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws';
import {
  createContract,
  createContractRuntime,
  ensureContractAccountMapped,
  type Contract,
  type ContractDef,
} from '@parity/product-sdk-contracts';
import type { PolkadotSigner } from 'polkadot-api';
import { CONFIG } from './config';
import { LEADERBOARD_ABI } from './abi';
import { getHostProvider, isInHost } from './host-wallet';

let clientPromise: Promise<PolkadotClient> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtime: any = null;
let contract: Contract<ContractDef> | null = null;

async function getClient(): Promise<PolkadotClient> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    if (isInHost()) {
      const provider = await getHostProvider(CONFIG.assetHubGenesisHash);
      if (!provider) {
        throw new Error('Host RPC provider unavailable (not inside a host container?)');
      }
      return createClient(provider);
    }
    // Standalone: direct WS, read-only.
    return createClient(getWsProvider(CONFIG.rpcEndpoint));
  })();
  return clientPromise;
}

async function getRuntime() {
  if (runtime) return runtime;
  const client = await getClient();
  // The unsafe API structurally provides tx.Revive.call/map_account,
  // query.Revive.OriginalAccount and apis.ReviveApi.call — exactly the
  // ReviveTypedApi surface the runtime needs, without generating descriptors.
  runtime = createContractRuntime(client.getUnsafeApi() as never);
  return runtime;
}

// Lazily build (and cache) the typed-ish leaderboard contract handle. Methods
// are accessed dynamically (e.g. `contract.submitScore.tx(...)`); the ABI is
// untyped so call sites cast the handle.
export async function getLeaderboardContract(): Promise<Contract<ContractDef>> {
  if (contract) return contract;
  const rt = await getRuntime();
  // No signerManager: signer + origin are passed per-call from leaderboard.ts
  // (the connected product account). defaultOrigin covers anonymous reads.
  contract = createContract(rt, CONFIG.contractAddress, LEADERBOARD_ABI as never, {
    defaultOrigin: CONFIG.readOrigin,
  });
  return contract;
}

// Map the account to its pallet-revive H160 if it isn't already. Required
// before any contract call: an unmapped origin makes even the read-only
// dry-run fail with Revive.AccountUnmapped. Idempotent (no-op once mapped);
// the first call submits a one-time map_account tx signed by `signer`.
export async function ensureAccountMapped(
  ss58Address: string,
  signer: PolkadotSigner,
  onStatus?: (status: string) => void,
): Promise<void> {
  const rt = await getRuntime();
  await ensureContractAccountMapped(rt, ss58Address, signer, {
    timeoutMs: 120_000,
    onStatus,
  });
}
