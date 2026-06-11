// UI-facing wallet service. thr33s is Proof-of-Personhood-only, so this is a
// thin wrapper over the host SignerManager — no browser-extension or MetaMask
// paths. The single account is the host product account (see host-wallet.ts).

import type { PolkadotSigner } from 'polkadot-api';
import {
  connectHost,
  subscribeHostConnection,
  isInHost,
  truncateAddress,
  type HostAccount,
} from './host-wallet';

export type WalletEventType = 'connect' | 'disconnect' | 'accountChange';

export interface WalletEvent {
  type: WalletEventType;
  address?: string;
}

type WalletEventListener = (event: WalletEvent) => void;

export class WalletService {
  private account: HostAccount | null = null;
  private listeners: WalletEventListener[] = [];
  private hostSubscription: (() => void) | null = null;

  subscribe(listener: WalletEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: WalletEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private applyAccount(account: HostAccount): void {
    this.account = account;
    this.emit({ type: 'connect', address: account.address });
  }

  // Auto-connect via the host. Safe to call on app start: resolves false when
  // not in a host or when the user hasn't signed in yet, but leaves a
  // subscription in place so a later sign-in emits `connect` automatically.
  async connectFromHost(): Promise<boolean> {
    if (!isInHost()) return false;

    this.hostSubscription?.();
    this.hostSubscription = subscribeHostConnection(
      (account) => this.applyAccount(account),
      () => {
        if (this.account) this.disconnect();
      },
    );

    const account = await connectHost();
    if (!account) return false;

    this.applyAccount(account);
    return true;
  }

  // Resolve when a `connect` event fires (e.g. the user signs in via the host
  // topbar while we wait), or when the timeout elapses.
  waitForConnection(timeoutMs: number): Promise<boolean> {
    if (this.isConnected()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        clearTimeout(timer);
        resolve(ok);
      };
      const unsubscribe = this.subscribe((event) => {
        if (event.type === 'connect') finish(true);
      });
      const timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  disconnect(): void {
    this.hostSubscription?.();
    this.hostSubscription = null;
    this.account = null;
    this.emit({ type: 'disconnect' });
  }

  isConnected(): boolean {
    return this.account !== null;
  }

  /** SS58 address of the connected account. */
  getAddress(): string | null {
    return this.account?.address ?? null;
  }

  /** H160 address — the on-chain leaderboard identity (msg.sender). */
  getH160(): string | null {
    return this.account?.h160Address ?? null;
  }

  /** PoP username (e.g. "daemiadot"), if the host surfaced one. */
  getAccountName(): string | null {
    return this.account?.name ?? null;
  }

  /** Alias kept for callers; same as the PoP username. */
  getHostAlias(): string | null {
    return this.account?.name ?? null;
  }

  /** Host signer for the connected product account. */
  getSigner(): PolkadotSigner {
    if (!this.account) throw new Error('Not signed in');
    return this.account.signer;
  }

  getDisplayAddress(): string {
    const address = this.getAddress();
    return address ? truncateAddress(address) : '';
  }
}

export const walletService = new WalletService();
