// Leaderboard service. Reads (getTopScores / getPersonalBest / getPlayerRank)
// are dry-run queries; submitScore is a signed Revive.call. All go through the
// @parity/product-sdk-contracts handle, which resolves the signer + origin from
// the shared SignerManager. No EVM RPC, no viem, no browser-wallet paths.

import { getLeaderboardContract, ensureAccountMapped } from './client';
import { walletService } from './wallet';

export type TransactionStatus =
  | 'signing'
  | 'broadcasting'
  | 'included'
  | 'finalized'
  | 'failed';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
  highestTile: number;
  timestamp: number;
}

// pallet-revive auto-maps accounts on first tx on paseo-next-v2
// (autoAccountMapping: true), so no explicit map_account is needed here.
type TxOpts = { signer: unknown; origin?: string };
type AnyContract = Record<string, {
  tx: (...args: unknown[]) => Promise<{ ok?: boolean; txHash?: string; dispatchError?: unknown }>;
  query: (...args: unknown[]) => Promise<{ success: boolean; value: unknown }>;
}>;

function num(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

export class LeaderboardService {
  async submitScore(
    score: number,
    highestTile: number,
    onStatus?: (status: TransactionStatus) => void,
  ): Promise<string> {
    if (!walletService.isConnected()) {
      throw new Error('Not signed in');
    }

    const signer = walletService.getSigner();
    const address = walletService.getAddress();
    if (!address) throw new Error('No address');

    const contract = (await getLeaderboardContract()) as unknown as AnyContract;

    // First contract call: map the account to its H160 (one-time). Without it
    // even the dry-run fails with Revive.AccountUnmapped.
    await ensureAccountMapped(address, signer, (s) => console.log('[submit] mapping:', s));

    const opts: TxOpts = { signer, origin: address };
    onStatus?.('signing');
    const result = await contract.submitScore.tx(BigInt(score), BigInt(highestTile), opts);

    if (result && result.ok === false) {
      onStatus?.('failed');
      throw new Error(`Transaction failed: ${JSON.stringify(result.dispatchError ?? 'unknown')}`);
    }

    onStatus?.('finalized');
    return result?.txHash ?? '';
  }

  async getTopScores(count: number = 20): Promise<LeaderboardEntry[]> {
    try {
      const contract = (await getLeaderboardContract()) as unknown as AnyContract;
      const res = await contract.getTopScores.query(BigInt(count));
      if (!res.success) return [];

      const rows = (res.value as Array<Record<string, unknown>>) ?? [];
      return rows.map((entry, index) => ({
        rank: index + 1,
        address: String(entry.player ?? entry[0] ?? ''),
        score: num(entry.score ?? entry[1]),
        highestTile: num(entry.highestTile ?? entry[2]),
        timestamp: num(entry.timestamp ?? entry[3]),
      }));
    } catch (error) {
      console.error('Failed to get top scores:', error);
      return [];
    }
  }

  async getPersonalBest(playerAddress?: string): Promise<number | null> {
    const address = playerAddress || walletService.getH160();
    if (!address) return null;
    try {
      const contract = (await getLeaderboardContract()) as unknown as AnyContract;
      const res = await contract.getPersonalBest.query(address);
      if (!res.success) return null;
      return num(res.value);
    } catch (error) {
      console.error('Failed to get personal best:', error);
      return null;
    }
  }

  async getPlayerRank(playerAddress?: string): Promise<number | null> {
    const address = playerAddress || walletService.getH160();
    if (!address) return null;
    try {
      const contract = (await getLeaderboardContract()) as unknown as AnyContract;
      const res = await contract.getPlayerRank.query(address);
      if (!res.success) return null;
      const rank = num(res.value);
      return rank === 0 ? null : rank;
    } catch (error) {
      console.error('Failed to get player rank:', error);
      return null;
    }
  }
}

export const leaderboardService = new LeaderboardService();
