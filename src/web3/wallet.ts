import { getWallets, type Wallet, type WalletAccount } from '@talismn/connect-wallets';
import { getPolkadotSignerFromPjs } from 'polkadot-api/pjs-signer';
import type { PolkadotSigner } from 'polkadot-api';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { CONFIG } from './config';
import {
  connectToHost,
  isInHost,
  subscribeHostConnection,
  type HostAccount,
} from './host-wallet';

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (args: unknown) => void) => void;
      removeListener: (event: string, callback: (args: unknown) => void) => void;
    };
  }
}

// Define the Polkadot Hub TestNet chain for viem
const polkadotHubTestnet = {
  id: CONFIG.chainId,
  name: CONFIG.chainName,
  nativeCurrency: {
    decimals: CONFIG.currencyDecimals,
    name: 'Paseo',
    symbol: CONFIG.currencySymbol,
  },
  rpcUrls: {
    default: { http: [CONFIG.evmRpcEndpoint] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: CONFIG.blockExplorer },
  },
};

export interface WalletProvider {
  id: string;
  name: string;
  installed: boolean;
  type: 'substrate' | 'evm';
}

export type WalletEventType = 'connect' | 'disconnect' | 'accountChange';

export interface WalletEvent {
  type: WalletEventType;
  address?: string;
  account?: WalletAccount;
}

type WalletEventListener = (event: WalletEvent) => void;

// Check if MetaMask is installed
function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

export class WalletService {
  private wallet: Wallet | null = null;
  private account: WalletAccount | null = null;
  private listeners: WalletEventListener[] = [];
  private walletType: 'substrate' | 'evm' | null = null;
  private evmAddress: string | null = null;
  private evmWalletClient: WalletClient | null = null;
  // Host-provided account (Polkadot Desktop / trUI / dot.li). Resolved via
  // `@novasamatech/product-sdk` instead of the Talisman/pjs bridge because
  // dot.li's cross-origin iframe only speaks the product-sdk protocol.
  private hostAccount: HostAccount | null = null;
  private hostSubscription: (() => void) | null = null;

  // Get available wallet providers
  getAvailableProviders(): WalletProvider[] {
    const providers: WalletProvider[] = [];

    // Add MetaMask as first option
    providers.push({
      id: 'metamask',
      name: 'MetaMask',
      installed: isMetaMaskInstalled(),
      type: 'evm',
    });

    // Add Substrate wallets
    const wallets = getWallets();
    const substrateProviders = wallets
      .filter((w) => CONFIG.supportedWallets.includes(w.extensionName))
      .map((w) => ({
        id: w.extensionName,
        name: w.title,
        installed: w.installed || false,
        type: 'substrate' as const,
      }));

    providers.push(...substrateProviders);
    return providers;
  }

  // Get installed wallet providers
  getInstalledProviders(): WalletProvider[] {
    return this.getAvailableProviders().filter((p) => p.installed);
  }

  // Subscribe to wallet events
  subscribe(listener: WalletEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: WalletEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // Attempt to auto-connect via the host (Polkadot Desktop / trUI / dot.li).
  // Safe to call unconditionally on app start — resolves false when not
  // running inside a host. When the host has no active session yet (user
  // hasn't signed in), this returns false but leaves a subscription in
  // place so a later sign-in will emit a `connect` event automatically.
  async connectFromHost(): Promise<boolean> {
    if (!isInHost()) return false;

    // Ensure we only have one subscription in flight across repeat calls.
    this.hostSubscription?.();
    this.hostSubscription = subscribeHostConnection(
      (account) => this.applyHostAccount(account),
      () => {
        if (this.hostAccount) this.disconnect();
      },
    );

    const account = await connectToHost();
    if (!account) return false;

    this.applyHostAccount(account);
    return true;
  }

  private applyHostAccount(account: HostAccount): void {
    this.hostAccount = account;
    this.wallet = null;
    this.account = null;
    this.evmAddress = null;
    this.evmWalletClient = null;
    this.walletType = 'substrate';

    this.emit({
      type: 'connect',
      address: account.address,
    });
  }

  // Connect to a wallet provider
  async connect(providerId: string): Promise<void> {
    // Handle MetaMask connection
    if (providerId === 'metamask') {
      await this.connectMetaMask();
      return;
    }

    // Handle Substrate wallet connection
    const wallets = getWallets();
    const selectedWallet = wallets.find((w) => w.extensionName === providerId);

    if (!selectedWallet) {
      throw new Error(`Wallet provider "${providerId}" not found`);
    }

    if (!selectedWallet.installed) {
      throw new Error(`Wallet "${selectedWallet.title}" is not installed`);
    }

    // Enable the wallet
    await selectedWallet.enable(CONFIG.appName);
    this.wallet = selectedWallet;
    this.walletType = 'substrate';

    // Get accounts
    const accounts = await selectedWallet.getAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts found in wallet');
    }

    // Auto-select first account
    this.account = accounts[0];

    this.emit({
      type: 'connect',
      address: this.account.address,
      account: this.account,
    });
  }

  // Connect to MetaMask
  private async connectMetaMask(): Promise<void> {
    if (!isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed');
    }

    const ethereum = window.ethereum!;

    // Request account access
    const accounts = await ethereum.request({
      method: 'eth_requestAccounts',
    }) as string[];

    if (accounts.length === 0) {
      throw new Error('No accounts found in MetaMask');
    }

    // Switch to Polkadot Hub TestNet
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CONFIG.chainId.toString(16)}` }],
      });
    } catch (switchError: unknown) {
      // Chain not added, add it
      if ((switchError as { code?: number })?.code === 4902) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${CONFIG.chainId.toString(16)}`,
            chainName: CONFIG.chainName,
            nativeCurrency: {
              name: 'Paseo',
              symbol: CONFIG.currencySymbol,
              decimals: CONFIG.currencyDecimals,
            },
            rpcUrls: [CONFIG.evmRpcEndpoint],
            blockExplorerUrls: [CONFIG.blockExplorer],
          }],
        });
      } else {
        throw switchError;
      }
    }

    // Create viem wallet client
    this.evmWalletClient = createWalletClient({
      chain: polkadotHubTestnet,
      transport: custom(ethereum),
    });

    this.evmAddress = accounts[0];
    this.walletType = 'evm';
    this.wallet = null;
    this.account = null;

    // Listen for account changes
    ethereum.on('accountsChanged', (accounts: unknown) => {
      const newAccounts = accounts as string[];
      if (newAccounts.length === 0) {
        this.disconnect();
      } else {
        this.evmAddress = newAccounts[0];
        this.emit({
          type: 'accountChange',
          address: this.evmAddress,
        });
      }
    });

    this.emit({
      type: 'connect',
      address: this.evmAddress,
    });
  }

  // Disconnect from wallet
  disconnect(): void {
    this.hostSubscription?.();
    this.hostSubscription = null;
    this.wallet = null;
    this.account = null;
    this.hostAccount = null;
    this.walletType = null;
    this.evmAddress = null;
    this.evmWalletClient = null;
    this.emit({ type: 'disconnect' });
  }

  // Check if connected
  isConnected(): boolean {
    if (this.walletType === 'evm') {
      return this.evmAddress !== null;
    }
    if (this.hostAccount !== null) return true;
    return this.wallet !== null && this.account !== null;
  }

  // Get connected address
  getAddress(): string | null {
    if (this.walletType === 'evm') {
      return this.evmAddress;
    }
    if (this.hostAccount) return this.hostAccount.address;
    return this.account?.address || null;
  }

  // Get account name
  getAccountName(): string | null {
    if (this.walletType === 'evm') {
      return 'MetaMask';
    }
    if (this.hostAccount) return this.hostAccount.name || null;
    return this.account?.name || null;
  }

  // Get truncated address for display
  getDisplayAddress(): string {
    const address = this.getAddress();
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Get wallet type
  getWalletType(): 'substrate' | 'evm' | null {
    return this.walletType;
  }

  // Get EVM wallet client (for MetaMask transactions)
  getEvmWalletClient(): WalletClient | null {
    return this.evmWalletClient;
  }

  // Get signer for transactions
  getSigner(): PolkadotSigner {
    if (this.hostAccount) {
      return this.hostAccount.signer;
    }

    if (!this.account || !this.wallet) {
      throw new Error('Wallet not connected');
    }

    const signer = this.wallet.extension?.signer;
    if (!signer?.signPayload || !signer?.signRaw) {
      throw new Error('Wallet does not support signing');
    }

    return getPolkadotSignerFromPjs(
      this.account.address,
      signer.signPayload,
      signer.signRaw
    );
  }

  // Get list of accounts
  async getAccounts(): Promise<WalletAccount[]> {
    if (!this.wallet) {
      return [];
    }
    return this.wallet.getAccounts();
  }

  // Select a different account
  selectAccount(account: WalletAccount): void {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    this.account = account;
    this.emit({
      type: 'accountChange',
      address: account.address,
      account: account,
    });
  }
}

// Singleton instance
export const walletService = new WalletService();
