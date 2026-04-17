import type { Address } from 'viem';

export const CONFIG = {
  // Paseo Asset Hub testnet (Polkadot Hub TestNet)
  chainId: 420420417,
  chainName: 'Polkadot Hub TestNet',

  // RPC endpoints
  // Substrate WebSocket RPC for polkadot-api
  rpcEndpoint: 'wss://sys.passet.ibp.network',

  // EVM HTTP RPC (for reference)
  evmRpcEndpoint: 'https://eth-rpc-testnet.polkadot.io/',

  // PoP identity (People) chain on the Stable network — the "Polkadot App"
  // testnet where attested usernames live. Stable ids: Relay, AssetHub (1000),
  // People (1004), Bulletin (2487). The older `pop_stable` port-routed URL
  // (:7912) tick3t used is stale; this is the current path-routed endpoint.
  popStableRpcEndpoint: 'wss://pop3-testnet.parity-lab.parity.io/people',

  // Currency
  currencySymbol: 'PAS',
  currencyDecimals: 18,

  // Block explorer
  blockExplorer: 'https://blockscout-testnet.polkadot.io/',

  // Contract address (deployed on Polkadot Hub TestNet)
  contractAddress: '0xC295A8b2D1E3fb8e70FaEc85eD6140060f36f2F5' as Address,

  // App name for wallet connection
  appName: 'Thr33s',

  // Supported wallet extension names
  supportedWallets: ['polkadot-js', 'subwallet-js', 'talisman'],
};

// Update contract address after deployment
export function setContractAddress(address: Address): void {
  CONFIG.contractAddress = address;
}
