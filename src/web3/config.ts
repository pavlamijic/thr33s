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

  // Paseo Asset Hub genesis hash — required by `createPapiProvider` so
  // the dot.li host can route our RPC through its sandbox-safe bridge
  // instead of opening a direct WebSocket (which the sandbox blocks).
  // Source: p2p-market's assethub-provider.ts.
  paseoAssetHubGenesisHash: '0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2' as `0x${string}`,

  // Paseo Next People chain (Id 5140) — the Polkadot App TestFlight testnet
  // where attested usernames live. The "Stable" network
  // (pop3-testnet.parity-lab.parity.io) is being decommissioned; Paseo Next
  // replaces it.
  popStableRpcEndpoint: 'wss://paseo-people-next-rpc.polkadot.io',

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
