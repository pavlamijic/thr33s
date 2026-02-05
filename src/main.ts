import './style.css';
import { type Direction, KEY_CODES } from './game/types';
import { GameStateManager } from './game/state';
import { GameRenderer } from './ui/renderer';
import { AnimationController } from './ui/animations';
import { TouchController } from './ui/touch';
import { TutorialController } from './ui/tutorial';
import {
  showGameOverModal,
  showLeaderboardModal,
  showWalletProviderModal,
  showLoadingModal,
  showErrorModal,
  showSuccessModal,
  showInstructionsModal,
  showSetAliasModal,
  type LeaderboardEntry,
} from './ui/modals';
import { getAlias, setAlias, getDisplayName } from './web3/aliases';
import { walletService } from './web3/wallet';
import { leaderboardService } from './web3/leaderboard';
import {
  initAudio,
  sounds,
  isSoundEnabled,
  setSoundEnabled,
  loadSoundSettings,
} from './audio/sounds';

// Game state
const gameState = new GameStateManager();
let renderer: GameRenderer;
let animationController: AnimationController;
let tutorialController: TutorialController;

// Input throttling
let lastMoveTime = 0;
const MOVE_THROTTLE = 200; // ms

// Initialize the game
function initializeGame(): void {
  renderer = new GameRenderer();
  animationController = new AnimationController(renderer);
  tutorialController = new TutorialController();

  // Initialize audio system
  loadSoundSettings();
  initAudio();

  // Set up game event listeners
  gameState.subscribe((event) => {
    switch (event.type) {
      case 'newGame':
        renderer.renderBoard(gameState.getBoard());
        renderer.renderNextTile(gameState.getNextTile());
        break;

      case 'move':
        // Check for matches and play appropriate sounds
        if (event.data?.moved) {
          handleMoveEffects(event.data.moved);
        }
        break;

      case 'scoreUpdate':
        renderer.updateScore(event.data?.score || 0);
        // Notify tutorial of high tile achievements
        if (event.data?.highestTile) {
          tutorialController.onHighTile(event.data.highestTile);
        }
        break;

      case 'gameOver':
        sounds.gameOver();
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

  // Set up sound toggle
  setupSoundToggle();

  // Set up wallet event listener
  walletService.subscribe(handleWalletEvent);

  // Start the game first so the board is populated
  gameState.newGame();

  // Then start tutorial overlay on top of the running game
  tutorialController.start();
}

// Handle move effects (sounds and tutorial callbacks)
function handleMoveEffects(moved: { merged: boolean; value: number }[]): void {
  // Notify tutorial of the move
  tutorialController.onMove();

  // Play swoosh sound for movement
  sounds.swoosh();

  // Check for matches
  for (const tile of moved) {
    if (tile.merged) {
      if (tile.value === 3) {
        // 1 + 2 = 3 match
        sounds.match12();
        tutorialController.onMatch12();
      } else if (tile.value >= 6) {
        // Twin match (3+3=6, 6+6=12, etc.)
        sounds.matchTwins(tile.value);
        tutorialController.onMatchTwins();
      }
    }
  }
}

// Handle keyboard input
function handleKeyDown(e: KeyboardEvent): void {
  // Don't handle game controls when typing in input fields or when modal is open
  const activeElement = document.activeElement;
  const isTyping = activeElement instanceof HTMLInputElement ||
                   activeElement instanceof HTMLTextAreaElement;
  const isModalOpen = document.querySelector('.modal-overlay') !== null;

  if (isTyping || isModalOpen) {
    return;
  }

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
    () => walletService.isConnected(),
    () => handleSubmitScore(score, highestTile),
    () => handleConnectWalletForSubmission(),
    () => handleSetAlias(),
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

// Handle wallet connection (for header button)
function handleConnectWallet(): void {
  handleConnectWalletForSubmission();
}

// Handle wallet connection for score submission (returns success status)
async function handleConnectWalletForSubmission(): Promise<boolean> {
  const providers = walletService.getInstalledProviders();

  if (providers.length === 0) {
    showErrorModal(
      'No wallet extensions detected. Please install Talisman, SubWallet, or Polkadot.js extension.'
    );
    return false;
  }

  return new Promise((resolve) => {
    showWalletProviderModal(providers, async (providerId) => {
      const closeLoading = showLoadingModal('Connecting wallet...');

      try {
        await walletService.connect(providerId);
        closeLoading();
        resolve(true);
      } catch (error) {
        closeLoading();
        console.error('Failed to connect wallet:', error);
        showErrorModal(
          `Failed to connect wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        resolve(false);
      }
    });
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
    const address = walletService.getAddress();
    const displayText = address ? getDisplayName(address) : walletService.getDisplayAddress();
    walletBtn.innerHTML = `
      <span class="wallet-address">${displayText}</span>
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
      leaderboardService.getTopScores(10),
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

    showLeaderboardModal(entries, walletService.getAddress(), personalBest, getDisplayName);
  } catch (error) {
    closeLoading();
    console.error('Failed to load leaderboard:', error);

    // Show empty leaderboard on error
    showLeaderboardModal([], walletService.getAddress(), null, getDisplayName);
  }
}

// Handle setting alias
function handleSetAlias(): void {
  const address = walletService.getAddress();
  if (!address) {
    showErrorModal('Please connect your wallet first to set an alias.');
    return;
  }

  const currentAlias = getAlias(address);
  showSetAliasModal(address, currentAlias, (newAlias) => {
    setAlias(address, newAlias);
    // Update wallet button to show new alias
    updateWalletButton();
  });
}

// Set up header buttons
function setupHeaderButtons(): void {
  const walletBtn = document.getElementById('wallet-btn')!;
  const leaderboardBtn = document.getElementById('leaderboard-btn')!;

  walletBtn.onclick = handleConnectWallet;
  leaderboardBtn.onclick = handleShowLeaderboard;

  updateWalletButton();
}

// Set up sound toggle button
function setupSoundToggle(): void {
  const headerRight = document.querySelector('.header-right');
  if (!headerRight) return;

  // Help button
  const helpBtn = document.createElement('button');
  helpBtn.id = 'help-btn';
  helpBtn.className = 'btn-icon';
  helpBtn.setAttribute('aria-label', 'How to play');
  helpBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`;
  helpBtn.onclick = () => showInstructionsModal();

  // Restart button
  const restartBtn = document.createElement('button');
  restartBtn.id = 'restart-btn';
  restartBtn.className = 'btn-icon';
  restartBtn.setAttribute('aria-label', 'Restart game');
  restartBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
  </svg>`;
  restartBtn.onclick = () => {
    if (confirm('Start a new game?')) {
      gameState.newGame();
    }
  };

  // Alias button (user icon)
  const aliasBtn = document.createElement('button');
  aliasBtn.id = 'alias-btn';
  aliasBtn.className = 'btn-icon';
  aliasBtn.setAttribute('aria-label', 'Set alias');
  aliasBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
  aliasBtn.onclick = handleSetAlias;

  // Sound toggle button
  const soundBtn = document.createElement('button');
  soundBtn.id = 'sound-toggle';
  soundBtn.className = 'btn-icon';
  soundBtn.setAttribute('aria-label', 'Toggle sound');

  const updateSoundIcon = () => {
    soundBtn.textContent = isSoundEnabled() ? '🔊' : '🔇';
    soundBtn.classList.toggle('muted', !isSoundEnabled());
  };

  soundBtn.onclick = () => {
    setSoundEnabled(!isSoundEnabled());
    updateSoundIcon();
  };

  updateSoundIcon();

  // Insert buttons at the beginning of header-right (before leaderboard button)
  headerRight.insertBefore(soundBtn, headerRight.firstChild);
  headerRight.insertBefore(aliasBtn, headerRight.firstChild);
  headerRight.insertBefore(restartBtn, headerRight.firstChild);
  headerRight.insertBefore(helpBtn, headerRight.firstChild);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeGame);
