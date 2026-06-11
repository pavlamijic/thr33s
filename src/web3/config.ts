// Chain + app configuration for thr33s.
//
// thr33s runs as a Proof-of-Personhood-only app inside the Polkadot host
// (dot.li / paseo.li web, polkadot-desktop, Polkadot app). All chain access
// goes over the Substrate WS via PAPI v2 — in a host it's routed through the
// host sandbox by `getHostProvider(genesisHash)`; standalone it connects
// directly to `rpcEndpoint` (read-only; signing requires a host).
//
// Network: paseo-next-v2 (the testnet the live gateways resolve). Params
// verified against paritytech/festival packages/shared/host/networks.ts and
// bulletin-deploy assets/environments.json.

export const CONFIG = {
  // ── paseo-next-v2 Asset Hub (pallet-revive contracts live here) ──
  chainName: 'Paseo Next v2 Asset Hub',

  // Substrate WebSocket RPC, used by PAPI for the standalone (non-host) path.
  rpcEndpoint: 'wss://paseo-asset-hub-next-rpc.polkadot.io',

  // Asset Hub genesis hash — handed to `getHostProvider` so the host routes
  // our RPC to the right chain. This chain has been re-genesised before
  // (last refreshed 2026-06-01); if the host rejects it as unsupported,
  // re-sync this hash from festival networks.ts / `bun run sync-network`.
  assetHubGenesisHash:
    '0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f' as `0x${string}`,

  // EVM chainId exposed by pallet-revive's eth-rpc (shared across Paseo
  // variants). Kept for reference / explorer links.
  chainId: 420420417,

  // Native token. Substrate layer is 10 decimals on paseo-next-v2.
  currencySymbol: 'PAS',
  currencyDecimals: 10,

  blockExplorer: 'https://assethub-paseo.subscan.io/',

  // ── Leaderboard contract ──
  // Thr33sLeaderboard on paseo-next-v2 Asset Hub, deployed 2026-06-11 via
  // scripts/deploy.mjs (Revive.instantiate_with_code over the substrate WS).
  contractAddress: '0xa63df27cdea854535612a5deff044e2075716d89' as `0x${string}`,

  // Origin used for read-only contract dry-runs when no user is connected
  // (e.g. viewing the leaderboard before sign-in). Any valid AccountId works
  // for a view call — this is the well-known //Alice address.
  readOrigin: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',

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
