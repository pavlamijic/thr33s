import { encodeFunctionData, decodeFunctionResult, type Address, type Hex } from 'viem';
import { LEADERBOARD_ABI } from './abi';
import { CONFIG } from './config';
import { polkadotClient, type TransactionStatus } from './client';
import { walletService } from './wallet';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
  highestTile: number;
  timestamp: number;
}

// Dummy address for read-only calls when no wallet is connected
const ZERO_ADDRESS = '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM'; // Well-known substrate address

export class LeaderboardService {
  private isInitialized = false;

  // Initialize the service
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await polkadotClient.connect();
    this.isInitialized = true;
  }

  // Submit a score to the leaderboard
  async submitScore(
    score: number,
    highestTile: number,
    onStatus?: (status: TransactionStatus) => void
  ): Promise<string> {
    if (!walletService.isConnected()) {
      throw new Error('Wallet not connected');
    }

    await this.initialize();

    const address = walletService.getAddress();
    if (!address) {
      throw new Error('No wallet address');
    }

    const signer = walletService.getSigner();

    // Encode the function call
    const callData = encodeFunctionData({
      abi: LEADERBOARD_ABI,
      functionName: 'submitScore',
      args: [BigInt(score), BigInt(highestTile)],
    });

    // Submit the transaction
    const txHash = await polkadotClient.submitTransaction(
      CONFIG.contractAddress,
      0n,
      callData as Hex,
      address,
      signer,
      onStatus || (() => {})
    );

    return txHash;
  }

  // Get top scores from the leaderboard
  async getTopScores(count: number = 20): Promise<LeaderboardEntry[]> {
    await this.initialize();

    // Use connected wallet address or a dummy address for read-only calls
    const originAddress = walletService.getAddress() || ZERO_ADDRESS;

    // Encode the function call
    const callData = encodeFunctionData({
      abi: LEADERBOARD_ABI,
      functionName: 'getTopScores',
      args: [BigInt(count)],
    });

    try {
      // Make the call
      const result = await polkadotClient.callContract(
        CONFIG.contractAddress,
        callData as Hex,
        originAddress
      );

      // Decode the result
      const decoded = decodeFunctionResult({
        abi: LEADERBOARD_ABI,
        functionName: 'getTopScores',
        data: result,
      }) as Array<{
        player: Address;
        score: bigint;
        highestTile: bigint;
        timestamp: bigint;
      }>;

      // Map to our interface
      return decoded.map((entry, index) => ({
        rank: index + 1,
        address: entry.player,
        score: Number(entry.score),
        highestTile: Number(entry.highestTile),
        timestamp: Number(entry.timestamp),
      }));
    } catch (error) {
      console.error('Failed to get top scores:', error);
      return [];
    }
  }

  // Get personal best for a player
  async getPersonalBest(playerAddress?: string): Promise<number | null> {
    await this.initialize();

    const address = playerAddress || walletService.getAddress();
    if (!address) return null;

    const originAddress = walletService.getAddress() || ZERO_ADDRESS;

    // Encode the function call
    const callData = encodeFunctionData({
      abi: LEADERBOARD_ABI,
      functionName: 'getPersonalBest',
      args: [address as Address],
    });

    try {
      const result = await polkadotClient.callContract(
        CONFIG.contractAddress,
        callData as Hex,
        originAddress
      );

      const decoded = decodeFunctionResult({
        abi: LEADERBOARD_ABI,
        functionName: 'getPersonalBest',
        data: result,
      }) as bigint;

      return Number(decoded);
    } catch (error) {
      console.error('Failed to get personal best:', error);
      return null;
    }
  }

  // Get a player's rank
  async getPlayerRank(playerAddress?: string): Promise<number | null> {
    await this.initialize();

    const address = playerAddress || walletService.getAddress();
    if (!address) return null;

    const originAddress = walletService.getAddress() || ZERO_ADDRESS;

    // Encode the function call
    const callData = encodeFunctionData({
      abi: LEADERBOARD_ABI,
      functionName: 'getPlayerRank',
      args: [address as Address],
    });

    try {
      const result = await polkadotClient.callContract(
        CONFIG.contractAddress,
        callData as Hex,
        originAddress
      );

      const decoded = decodeFunctionResult({
        abi: LEADERBOARD_ABI,
        functionName: 'getPlayerRank',
        data: result,
      }) as bigint;

      const rank = Number(decoded);
      return rank === 0 ? null : rank;
    } catch (error) {
      console.error('Failed to get player rank:', error);
      return null;
    }
  }
}

// Singleton instance
export const leaderboardService = new LeaderboardService();
