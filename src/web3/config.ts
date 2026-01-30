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

  // Currency
  currencySymbol: 'PAS',
  currencyDecimals: 18,

  // Block explorer
  blockExplorer: 'https://blockscout-testnet.polkadot.io/',

  // Contract address (to be updated after deployment)
  contractAddress: '0x0000000000000000000000000000000000000000' as Address,

  // App name for wallet connection
  appName: 'Thr33s',

  // Supported wallet extension names
  supportedWallets: ['polkadot-js', 'subwallet-js', 'talisman'],
};

// Update contract address after deployment
export function setContractAddress(address: Address): void {
  CONFIG.contractAddress = address;
}
