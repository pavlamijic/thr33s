// Chain + app configuration for thr33s.
//
// thr33s runs as a Proof-of-Personhood-only app inside the Polkadot host
// (paseo.li / dev-dot.li web, polkadot-desktop, Polkadot app). All chain access
// goes over the Substrate WS via PAPI v2 — in a host it's routed through the
// host sandbox by `getHostProvider(genesisHash)`; standalone it connects
// directly to `rpcEndpoint` (read-only; signing requires a host).
//
// The target network is chosen at build time by VITE_NETWORK (set from
// NETWORK in .github/workflows/deploy.yml). Params verified against
// polkadot-app-deploy assets/environments.json and
// https://docs.polkadotcommunity.foundation/reference/networks/.

type NetworkId = 'paseo-next-v2' | 'devnet';

const NETWORKS = {
  // Paseo Next v2 (Asset Hub Next 1500), served at <name>.paseo.li. Names use
  // the `.paseo` TLD since dotNS v0.6.0. Re-genesised Sep 2026; if the host
  // rejects the genesis as unsupported, re-sync it from the chain.
  'paseo-next-v2': {
    chainName: 'Paseo Asset Hub Next',
    rpcEndpoint: 'wss://paseo-asset-hub-next-rpc.polkadot.io',
    assetHubGenesisHash:
      '0x4349b00e54897e21196fd331015fc5be0f14e118beb0375ed2bb1793737bb57a' as `0x${string}`,
    // Thr33sLeaderboard, deployed 2026-10-05 via scripts/deploy.mjs.
    contractAddress: '0x8b6cdbf8eb3de22910fd3ca98cb8b1fde4c02e0c' as `0x${string}`,
    tld: 'paseo',
    webGateway: 'paseo.li',
  },
  // Products Devnet on public Paseo system chains (Asset Hub 1000 / People
  // 1004 / Bulletin 1010), served at <name>.dev-dot.li.
  devnet: {
    chainName: 'Paseo Asset Hub',
    rpcEndpoint: 'wss://asset-hub-paseo-rpc.n.dwellir.com',
    assetHubGenesisHash:
      '0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2' as `0x${string}`,
    // Thr33sLeaderboard, deployed 2026-09-30 via scripts/deploy.mjs.
    contractAddress: '0x8b6cdbf8eb3de22910fd3ca98cb8b1fde4c02e0c' as `0x${string}`,
    tld: 'dot',
    webGateway: 'dev-dot.li',
  },
} satisfies Record<NetworkId, unknown>;

const envNetwork = (import.meta as { env?: { VITE_NETWORK?: string } }).env?.VITE_NETWORK;
export const NETWORK: NetworkId = envNetwork === 'devnet' ? 'devnet' : 'paseo-next-v2';
const NET = NETWORKS[NETWORK];

export const CONFIG = {
  // ── Asset Hub (pallet-revive contracts live here) ──
  network: NETWORK,
  chainName: NET.chainName,

  // Substrate WebSocket RPC, used by PAPI for the standalone (non-host) path.
  rpcEndpoint: NET.rpcEndpoint,

  // Asset Hub genesis hash — handed to `getHostProvider` so the host routes
  // our RPC to the right chain.
  assetHubGenesisHash: NET.assetHubGenesisHash,

  // EVM chainId exposed by pallet-revive's eth-rpc (shared across Paseo
  // variants). Kept for reference / explorer links.
  chainId: 420420417,

  // Native token. Substrate layer is 10 decimals on Paseo.
  currencySymbol: 'PAS',
  currencyDecimals: 10,

  blockExplorer: 'https://assethub-paseo.subscan.io/',

  // ── Leaderboard contract ──
  // Thr33sLeaderboard, deployed per network via scripts/deploy.mjs
  // (Revive.instantiate_with_code over the substrate WS).
  contractAddress: NET.contractAddress,

  // Origin used for read-only contract dry-runs when no user is connected
  // (e.g. viewing the leaderboard before sign-in). pallet-revive's own pallet
  // account — always exists on chain, so the dry-run never fails for an
  // unmapped/absent origin. Bytes "modlpy/reviv" + zero padding, SS58 prefix 42
  // (per product-sdk PR #152, mirrors Pallet::<T>::account_id()).
  readOrigin: '5EYCAe5ijiYfhaAUBd6H9WGRTsvwFFc7GnhQkiHvBYxdvpbV',

  // App identity. The product account is derived per DotNS name; thr33s is
  // published as playthrees33.<tld>. `host-wallet.ts` derives this from the URL
  // at runtime (so previews work) and falls back to this value.
  tld: NET.tld,
  webGateway: NET.webGateway,
  appDotNs: `playthrees33.${NET.tld}`,
  appName: 'Thr33s',
};

// Update contract address after deployment (used by scripts / tests).
export function setContractAddress(address: `0x${string}`): void {
  CONFIG.contractAddress = address;
}
