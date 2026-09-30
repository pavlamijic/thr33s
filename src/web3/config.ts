// Chain + app configuration for thr33s.
//
// thr33s runs as a Proof-of-Personhood-only app inside the Polkadot host
// (dev-dot.li / dot.li web, polkadot-desktop, Polkadot app). All chain access
// goes over the Substrate WS via PAPI v2 — in a host it's routed through the
// host sandbox by `getHostProvider(genesisHash)`; standalone it connects
// directly to `rpcEndpoint` (read-only; signing requires a host).
//
// Network: `devnet` — the Products Devnet on public Paseo system chains
// (Asset Hub 1000 / People 1004 / Bulletin 1010), served at <name>.dev-dot.li.
// Params verified against polkadot-app-deploy assets/environments.json and
// https://docs.polkadotcommunity.foundation/reference/networks/.

export const CONFIG = {
  // ── Paseo Asset Hub (pallet-revive contracts live here) ──
  chainName: 'Paseo Asset Hub',

  // Substrate WebSocket RPC, used by PAPI for the standalone (non-host) path.
  rpcEndpoint: 'wss://asset-hub-paseo-rpc.n.dwellir.com',

  // Asset Hub genesis hash — handed to `getHostProvider` so the host routes
  // our RPC to the right chain. (Paseo Asset Hub Next was re-genesised in
  // Sep 2026, which is what broke the old paseo-next-v2 deployment.)
  assetHubGenesisHash:
    '0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2' as `0x${string}`,

  // EVM chainId exposed by pallet-revive's eth-rpc (shared across Paseo
  // variants). Kept for reference / explorer links.
  chainId: 420420417,

  // Native token. Substrate layer is 10 decimals on Paseo.
  currencySymbol: 'PAS',
  currencyDecimals: 10,

  blockExplorer: 'https://assethub-paseo.subscan.io/',

  // ── Leaderboard contract ──
  // Thr33sLeaderboard on Paseo Asset Hub (devnet), deployed 2026-09-30 via
  // scripts/deploy.mjs (Revive.instantiate_with_code over the substrate WS).
  contractAddress: '0x8b6cdbf8eb3de22910fd3ca98cb8b1fde4c02e0c' as `0x${string}`,

  // Origin used for read-only contract dry-runs when no user is connected
  // (e.g. viewing the leaderboard before sign-in). pallet-revive's own pallet
  // account — always exists on chain, so the dry-run never fails for an
  // unmapped/absent origin. Bytes "modlpy/reviv" + zero padding, SS58 prefix 42
  // (per product-sdk PR #152, mirrors Pallet::<T>::account_id()).
  readOrigin: '5EYCAe5ijiYfhaAUBd6H9WGRTsvwFFc7GnhQkiHvBYxdvpbV',

  // App identity. The product account is derived per DotNS name; thr33s is
  // published at playthrees33.dot. `host-wallet.ts` derives this from the URL
  // at runtime (so previews work) and falls back to this value.
  appDotNs: 'playthrees33.dot',
  appName: 'Thr33s',
};

// Update contract address after deployment (used by scripts / tests).
export function setContractAddress(address: `0x${string}`): void {
  CONFIG.contractAddress = address;
}
