import { encodeFunctionData, createPublicClient, http, type Address, type Hex } from 'viem';
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

// Define the chain for viem
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

// Create public client for read operations
const publicClient = createPublicClient({
  chain: polkadotHubTestnet,
  transport: http(CONFIG.evmRpcEndpoint),
});

export class LeaderboardService {
  private isInitialized = false;

  // Initialize the service
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Only connect polkadot client for substrate wallets
    if (walletService.getWalletType() === 'substrate') {
      await polkadotClient.connect();
    }
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

    const address = walletService.getAddress();
    if (!address) {
      throw new Error('No wallet address');
    }

    // Handle EVM wallet (MetaMask)
    if (walletService.getWalletType() === 'evm') {
      return this.submitScoreEvm(score, highestTile, address, onStatus);
    }

    // Handle Substrate wallet
    await this.initialize();

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

  // Submit score using EVM wallet (MetaMask)
  private async submitScoreEvm(
    score: number,
    highestTile: number,
    address: string,
    onStatus?: (status: TransactionStatus) => void
  ): Promise<string> {
    const walletClient = walletService.getEvmWalletClient();
    if (!walletClient) {
      throw new Error('EVM wallet client not available');
    }

    onStatus?.('signing');

    try {
      // Send the transaction
      const hash = await walletClient.writeContract({
        address: CONFIG.contractAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'submitScore',
        args: [BigInt(score), BigInt(highestTile)],
        account: address as Address,
        chain: polkadotHubTestnet,
      });

      onStatus?.('broadcasting');

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        onStatus?.('finalized');
      } else {
        throw new Error('Transaction failed');
      }

      return hash;
    } catch (error) {
      console.error('Failed to submit score via EVM:', error);
      throw error;
    }
  }

  // Get top scores from the leaderboard
  async getTopScores(count: number = 20): Promise<LeaderboardEntry[]> {
    try {
      // Use viem public client for reading (works for both EVM and Substrate wallets)
      const result = await publicClient.readContract({
        address: CONFIG.contractAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'getTopScores',
        args: [BigInt(count)],
      }) as Array<{
        player: Address;
        score: bigint;
        highestTile: bigint;
        timestamp: bigint;
      }>;

      // Map to our interface
      return result.map((entry, index) => ({
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
    const address = playerAddress || walletService.getAddress();
    if (!address) return null;

    try {
      const result = await publicClient.readContract({
        address: CONFIG.contractAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'getPersonalBest',
        args: [address as Address],
      }) as bigint;

      return Number(result);
    } catch (error) {
      console.error('Failed to get personal best:', error);
      return null;
    }
  }

  // Get a player's rank
  async getPlayerRank(playerAddress?: string): Promise<number | null> {
    const address = playerAddress || walletService.getAddress();
    if (!address) return null;

    try {
      const result = await publicClient.readContract({
        address: CONFIG.contractAddress,
        abi: LEADERBOARD_ABI,
        functionName: 'getPlayerRank',
        args: [address as Address],
      }) as bigint;

      const rank = Number(result);
      return rank === 0 ? null : rank;
    } catch (error) {
      console.error('Failed to get player rank:', error);
      return null;
    }
  }
}

// Singleton instance
export const leaderboardService = new LeaderboardService();
