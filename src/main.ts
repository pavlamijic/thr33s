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
  showLoadingModal,
  showErrorModal,
  showSuccessModal,
  showInstructionsModal,
  type LeaderboardEntry,
} from './ui/modals';
import { walletService } from './web3/wallet';
import { CONFIG } from './web3/config';
import { isInHost, truncateAddress } from './web3/host-wallet';
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

  // If we're running inside a Polkadot Desktop / trUI host, try to
  // auto-connect to the host-injected account so the user never sees
  // the wallet picker. Failure is silent — the user can still click
  // Connect Wallet to pick a browser extension.
  void walletService.connectFromHost().catch((error) => {
    console.warn('[host] auto-connect failed:', error);
  });
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
    () => {
      gameState.newGame();
    },
    isInHost() ? 'Sign in with Polkadot App to Submit' : 'Connect Wallet to Submit',
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

// Handle sign-in for score submission (returns success status). thr33s is
// Proof-of-Personhood-only: the only identity is the host (Polkadot app)
// account. Outside a host there is nothing to connect to.
async function handleConnectWalletForSubmission(): Promise<boolean> {
  console.log('[connect] clicked; isInHost=', isInHost(), 'connected=', walletService.isConnected());

  if (!isInHost()) {
    showErrorModal(
      `Open Thr33s in the Polkadot app (or at playthrees33.${CONFIG.webGateway}) and sign in to submit your score.`,
    );
    return false;
  }

  // connectFromHost resolves immediately if a session already exists;
  // otherwise it leaves a subscription so a later topbar sign-in continues
  // automatically.
  console.log('[connect] trying connectFromHost');
  const alreadyConnected = await walletService.connectFromHost();
  console.log('[connect] connectFromHost →', alreadyConnected);
  if (alreadyConnected) return true;

  console.log('[connect] showing sign-in-via-topbar modal');
  const closeLoading = showLoadingModal(
    'Sign in with the Polkadot app using the topbar. This will continue automatically once you are signed in.',
  );
  const connected = await walletService.waitForConnection(120_000);
  closeLoading();
  console.log('[connect] waitForConnection →', connected);

  if (connected) return true;
  showErrorModal(
    'No sign-in detected. Open the Polkadot-app sign-in from the topbar and try again.',
  );
  return false;
}

// Handle wallet disconnect
function handleDisconnectWallet(): void {
  walletService.disconnect();
}

// Handle wallet events
function handleWalletEvent(_event: { type: string; address?: string }): void {
  updateWalletButton();
}

function updateWalletButton(): void {
  const walletBtn = document.getElementById('wallet-btn')!;

  if (walletService.isConnected()) {
    // The host surfaces the user's PoP username (e.g. "daemiadot") on the
    // account; fall back to the truncated address if it didn't.
    const name = walletService.getAccountName();
    const address = walletService.getAddress();
    const label = name ?? (address ? truncateAddress(address) : '');
    walletBtn.innerHTML = `
      <span class="wallet-dot" aria-hidden="true"></span>
      <span class="wallet-address">${label}</span>
    `;
    walletBtn.title = address ?? '';
    walletBtn.classList.remove('btn-primary');
    walletBtn.classList.add('wallet-connected');
    walletBtn.onclick = handleDisconnectWallet;
  } else {
    walletBtn.textContent = 'Sign in with Polkadot App';
    walletBtn.title = '';
    walletBtn.classList.remove('wallet-connected');
    walletBtn.classList.add('btn-primary');
    walletBtn.onclick = handleConnectWallet;
  }
}

// Resolve a leaderboard row (keyed by stored H160) to a display name. Scores
// store the product account's H160, which doesn't reverse-resolve to a PoP
// username on-chain, so we can only label the signed-in user's own row (via
// the host-surfaced name); everyone else shows a truncated address.
function makeDisplayNameResolver(): (address: string) => Promise<string> {
  const myH160 = walletService.getH160()?.toLowerCase() ?? null;
  const myName = walletService.getAccountName();
  return (address: string) => {
    if (myH160 && myName && address.toLowerCase() === myH160) {
      return Promise.resolve(myName);
    }
    return Promise.resolve(truncateAddress(address));
  };
}

// Show leaderboard
async function handleShowLeaderboard(): Promise<void> {
  const closeLoading = showLoadingModal('Loading leaderboard...');
  const resolveDisplayName = makeDisplayNameResolver();
  const myH160 = walletService.getH160();

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

    showLeaderboardModal(entries, myH160, personalBest, resolveDisplayName);
  } catch (error) {
    closeLoading();
    console.error('Failed to load leaderboard:', error);

    // Show empty leaderboard on error
    showLeaderboardModal([], myH160, null, resolveDisplayName);
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

// Theme (dark default). The initial value is applied in index.html before
// paint; here we just read/flip it and persist.
const THEME_KEY = 'thr33s-theme';
type Theme = 'dark' | 'light';

const SUN_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
</svg>`;
const MOON_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>`;

function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore storage failures (private mode, host sandbox)
  }
}

// Set up sound toggle button
function setupSoundToggle(): void {
  const headerRight = document.querySelector('.header-right');
  if (!headerRight) return;

  // Theme toggle button (dark is default)
  const themeBtn = document.createElement('button');
  themeBtn.id = 'theme-toggle';
  themeBtn.className = 'btn-icon';

  const updateThemeIcon = () => {
    const dark = getTheme() === 'dark';
    themeBtn.innerHTML = dark ? MOON_ICON : SUN_ICON;
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };

  themeBtn.onclick = () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    updateThemeIcon();
  };

  updateThemeIcon();

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

  // Insert buttons at the beginning of header-right (before leaderboard button).
  // Each insertBefore prepends, so the last inserted ends up leftmost →
  // final order: theme, help, restart, sound, [leaderboard], [wallet].
  headerRight.insertBefore(soundBtn, headerRight.firstChild);
  headerRight.insertBefore(restartBtn, headerRight.firstChild);
  headerRight.insertBefore(helpBtn, headerRight.firstChild);
  headerRight.insertBefore(themeBtn, headerRight.firstChild);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeGame);
