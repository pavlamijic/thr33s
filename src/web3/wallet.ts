import { getWallets, type Wallet, type WalletAccount } from '@talismn/connect-wallets';
import { getPolkadotSignerFromPjs } from 'polkadot-api/pjs-signer';
import type { PolkadotSigner } from 'polkadot-api';
import { CONFIG } from './config';

export interface WalletProvider {
  id: string;
  name: string;
  installed: boolean;
}

export type WalletEventType = 'connect' | 'disconnect' | 'accountChange';

export interface WalletEvent {
  type: WalletEventType;
  address?: string;
  account?: WalletAccount;
}

type WalletEventListener = (event: WalletEvent) => void;

export class WalletService {
  private wallet: Wallet | null = null;
  private account: WalletAccount | null = null;
  private listeners: WalletEventListener[] = [];

  // Get available wallet providers
  getAvailableProviders(): WalletProvider[] {
    const wallets = getWallets();
    return wallets
      .filter((w) => CONFIG.supportedWallets.includes(w.extensionName))
      .map((w) => ({
        id: w.extensionName,
        name: w.title,
        installed: w.installed || false,
      }));
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

  // Connect to a wallet provider
  async connect(providerId: string): Promise<void> {
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

  // Disconnect from wallet
  disconnect(): void {
    this.wallet = null;
    this.account = null;
    this.emit({ type: 'disconnect' });
  }

  // Check if connected
  isConnected(): boolean {
    return this.wallet !== null && this.account !== null;
  }

  // Get connected address
  getAddress(): string | null {
    return this.account?.address || null;
  }

  // Get account name
  getAccountName(): string | null {
    return this.account?.name || null;
  }

  // Get truncated address for display
  getDisplayAddress(): string {
    const address = this.getAddress();
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Get signer for transactions
  getSigner(): PolkadotSigner {
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
