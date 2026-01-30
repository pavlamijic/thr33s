import './style.css';
import { type Direction, KEY_CODES } from './game/types';
import { GameStateManager } from './game/state';
import { GameRenderer } from './ui/renderer';
import { AnimationController } from './ui/animations';
import { TouchController } from './ui/touch';
import {
  showGameOverModal,
  showLeaderboardModal,
  showWalletProviderModal,
  showLoadingModal,
  showErrorModal,
  showSuccessModal,
  type LeaderboardEntry,
} from './ui/modals';
import { walletService } from './web3/wallet';
import { leaderboardService } from './web3/leaderboard';

// Game state
const gameState = new GameStateManager();
let renderer: GameRenderer;
let animationController: AnimationController;

// Input throttling
let lastMoveTime = 0;
const MOVE_THROTTLE = 200; // ms

// Initialize the game
function initializeGame(): void {
  renderer = new GameRenderer();
  animationController = new AnimationController(renderer);

  // Set up game event listeners
  gameState.subscribe((event) => {
    switch (event.type) {
      case 'newGame':
        renderer.renderBoard(gameState.getBoard());
        renderer.renderNextTile(gameState.getNextTile());
        break;

      case 'scoreUpdate':
        renderer.updateScore(event.data?.score || 0);
        break;

      case 'gameOver':
        handleGameOver(event.data?.score || 0, event.data?.highestTile || 0);
        break;
    }
  });

  // Set up touch controls
  const gameBoard = document.getElementById('game-board')!;
  new TouchController(gameBoard, handleMove);

  // Set up keyboard controls
  document.addEventListener('keydown', handleKeyDown);

  // Set up header buttons
  setupHeaderButtons();

  // Set up wallet event listener
  walletService.subscribe(handleWalletEvent);

  // Start a new game
  gameState.newGame();
}

// Handle keyboard input
function handleKeyDown(e: KeyboardEvent): void {
  const direction = KEY_CODES[e.key];
  if (direction) {
    e.preventDefault();
    handleMove(direction);
  }
}

// Handle move input (from keyboard or touch)
async function handleMove(direction: Direction): Promise<void> {
  // Throttle input
  const now = Date.now();
  if (now - lastMoveTime < MOVE_THROTTLE) return;
  if (animationController.isPlaying()) return;

  lastMoveTime = now;

  // Attempt the move
  const moved = gameState.move(direction);

  if (moved) {
    // Re-render the board after move
    renderer.renderBoard(gameState.getBoard());
    renderer.renderNextTile(gameState.getNextTile());
  }
}

// Handle game over
function handleGameOver(score: number, highestTile: number): void {
  showGameOverModal(
    score,
    highestTile,
    walletService.isConnected(),
    () => handleSubmitScore(score, highestTile),
    () => handleConnectWallet(),
    () => {
      gameState.newGame();
    }
  );
}

// Handle score submission
async function handleSubmitScore(score: number, highestTile: number): Promise<void> {
  const closeLoading = showLoadingModal('Submitting score...');

  try {
    await leaderboardService.submitScore(score, highestTile, (status) => {
      console.log('Transaction status:', status);
    });

    closeLoading();
    showSuccessModal('Score Submitted!', 'Your score has been recorded on the leaderboard.');
  } catch (error) {
    closeLoading();
    console.error('Failed to submit score:', error);
    showErrorModal(
      `Failed to submit score: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Handle wallet connection
function handleConnectWallet(): void {
  const providers = walletService.getInstalledProviders();

  if (providers.length === 0) {
    showErrorModal(
      'No wallet extensions detected. Please install Talisman, SubWallet, or Polkadot.js extension.'
    );
    return;
  }

  showWalletProviderModal(providers, async (providerId) => {
    const closeLoading = showLoadingModal('Connecting wallet...');

    try {
      await walletService.connect(providerId);
      closeLoading();
    } catch (error) {
      closeLoading();
      console.error('Failed to connect wallet:', error);
      showErrorModal(
        `Failed to connect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });
}

// Handle wallet disconnect
function handleDisconnectWallet(): void {
  walletService.disconnect();
}

// Handle wallet events
function handleWalletEvent(_event: { type: string; address?: string }): void {
  updateWalletButton();
}

// Update wallet button state
function updateWalletButton(): void {
  const walletBtn = document.getElementById('wallet-btn')!;

  if (walletService.isConnected()) {
    const displayAddress = walletService.getDisplayAddress();
    walletBtn.innerHTML = `
      <span class="wallet-address">${displayAddress}</span>
    `;
    walletBtn.classList.add('wallet-connected');
    walletBtn.onclick = handleDisconnectWallet;
  } else {
    walletBtn.textContent = 'Connect Wallet';
    walletBtn.classList.remove('wallet-connected');
    walletBtn.onclick = handleConnectWallet;
  }
}

// Show leaderboard
async function handleShowLeaderboard(): Promise<void> {
  const closeLoading = showLoadingModal('Loading leaderboard...');

  try {
    const [scores, personalBest] = await Promise.all([
      leaderboardService.getTopScores(20),
      walletService.isConnected() ? leaderboardService.getPersonalBest() : Promise.resolve(null),
    ]);

    closeLoading();

    const entries: LeaderboardEntry[] = scores.map((s, i) => ({
      rank: i + 1,
      address: s.address,
      score: s.score,
      highestTile: s.highestTile,
      timestamp: s.timestamp,
    }));

    showLeaderboardModal(entries, walletService.getAddress(), personalBest);
  } catch (error) {
    closeLoading();
    console.error('Failed to load leaderboard:', error);

    // Show empty leaderboard on error
    showLeaderboardModal([], walletService.getAddress(), null);
  }
}

// Set up header buttons
function setupHeaderButtons(): void {
  const walletBtn = document.getElementById('wallet-btn')!;
  const leaderboardBtn = document.getElementById('leaderboard-btn')!;

  walletBtn.onclick = handleConnectWallet;
  leaderboardBtn.onclick = handleShowLeaderboard;

  updateWalletButton();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeGame);
