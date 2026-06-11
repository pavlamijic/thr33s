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
  type Contract,
  type ContractDef,
} from '@parity/product-sdk-contracts';
import { CONFIG } from './config';
import { LEADERBOARD_ABI } from './abi';
import { getHostProvider, isInHost } from './host-wallet';

let clientPromise: Promise<PolkadotClient> | null = null;
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

// Lazily build (and cache) the typed-ish leaderboard contract handle. Methods
// are accessed dynamically (e.g. `contract.submitScore.tx(...)`); the ABI is
// untyped so call sites cast the handle.
export async function getLeaderboardContract(): Promise<Contract<ContractDef>> {
  if (contract) return contract;
  const client = await getClient();
  // The unsafe API structurally provides tx.Revive.call/map_account,
  // query.Revive.OriginalAccount and apis.ReviveApi.call — exactly the
  // ReviveTypedApi surface the runtime needs, without generating descriptors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime = createContractRuntime(client.getUnsafeApi() as any);
  // No signerManager: signer + origin are passed per-call from leaderboard.ts
  // (the connected product account). defaultOrigin covers anonymous reads.
  contract = createContract(runtime, CONFIG.contractAddress, LEADERBOARD_ABI as never, {
    defaultOrigin: CONFIG.readOrigin,
  });
  return contract;
}
