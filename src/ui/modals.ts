export interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
  highestTile: number;
  timestamp: number;
}

export interface WalletProvider {
  id: string;
  name: string;
  icon?: string;
}

type ModalCloseCallback = () => void;

// Truncate address for display
function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Create modal overlay
function createModalOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  return overlay;
}

// Show game over modal with dynamic wallet state
export function showGameOverModal(
  score: number,
  highestTile: number,
  isWalletConnected: () => boolean,
  onSubmitScore: () => Promise<void>,
  onConnectWallet: () => Promise<boolean>,
  onPlayAgain: () => void
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  function renderButtons() {
    const buttonsContainer = modal.querySelector('.modal-buttons')!;
    const connected = isWalletConnected();

    buttonsContainer.innerHTML = connected
      ? `
        <button class="btn btn-primary" id="submit-score-btn">Submit to Leaderboard</button>
        <button class="btn btn-secondary" id="play-again-btn">Play Again</button>
      `
      : `
        <button class="btn btn-primary" id="connect-wallet-btn">Connect Wallet to Submit</button>
        <button class="btn btn-secondary" id="play-again-btn">Play Again</button>
      `;

    attachButtonHandlers();
  }

  function attachButtonHandlers() {
    const submitBtn = modal.querySelector('#submit-score-btn');
    const connectBtn = modal.querySelector('#connect-wallet-btn');
    const playAgainBtn = modal.querySelector('#play-again-btn');

    submitBtn?.addEventListener('click', async () => {
      await onSubmitScore();
    });

    connectBtn?.addEventListener('click', async () => {
      const success = await onConnectWallet();
      if (success) {
        renderButtons();
      }
    });

    playAgainBtn?.addEventListener('click', () => {
      close();
      onPlayAgain();
    });
  }

  modal.innerHTML = `
    <h2>Game Over</h2>
    <div class="modal-score">${score}</div>
    <div class="modal-highest">Highest tile: ${highestTile}</div>
    <div class="modal-buttons"></div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  renderButtons();

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  function close() {
    overlay.remove();
  }

  return close;
}

// Escapes a string for safe insertion into HTML text content.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show leaderboard modal. If `resolveDisplayName` is provided, rows render
// immediately with the truncated address and each cell is upgraded in place
// as its display name resolves.
export function showLeaderboardModal(
  entries: LeaderboardEntry[],
  currentAddress: string | null,
  personalBest: number | null,
  resolveDisplayName?: (address: string) => Promise<string>
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  const entriesHtml = entries.length === 0
    ? '<p>No scores yet. Be the first!</p>'
    : `
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Score</th>
            <th>Tile</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
              <tr class="${entry.address.toLowerCase() === currentAddress?.toLowerCase() ? 'highlight' : ''}">
                <td>${entry.rank}</td>
                <td class="leaderboard-player" data-address="${escapeHtml(entry.address)}">${escapeHtml(truncateAddress(entry.address))}</td>
                <td>${entry.score}</td>
                <td>${entry.highestTile}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    `;

  const personalBestHtml = personalBest !== null
    ? `<p>Your best: <strong>${personalBest}</strong></p>`
    : '';

  modal.innerHTML = `
    <h2>Leaderboard</h2>
    ${entriesHtml}
    ${personalBestHtml}
    <div class="modal-buttons">
      <button class="btn btn-secondary" id="close-leaderboard-btn">Close</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  let cancelled = false;

  function close() {
    cancelled = true;
    overlay.remove();
  }

  // Close handlers
  const closeBtn = modal.querySelector('#close-leaderboard-btn');
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Progressive enhancement: swap each cell's text with the resolved display
  // name (typically a PoP-attested username). Resolutions can fail silently —
  // the truncated fallback is already rendered.
  if (resolveDisplayName) {
    const cells = modal.querySelectorAll<HTMLElement>('.leaderboard-player[data-address]');
    cells.forEach((cell) => {
      const address = cell.dataset.address;
      if (!address) return;
      resolveDisplayName(address)
        .then((name) => {
          if (cancelled) return;
          if (name && name !== cell.textContent) {
            cell.textContent = name;
          }
        })
        .catch(() => {
          // Truncated fallback is already in place; nothing to do.
        });
    });
  }

  return close;
}

// Show wallet provider selection modal
export function showWalletProviderModal(
  providers: WalletProvider[],
  onSelectProvider: (providerId: string) => void
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  const providersHtml = providers.length === 0
    ? '<p>No wallet extensions detected. Please install Talisman, SubWallet, or Polkadot.js extension.</p>'
    : `
      <div class="wallet-options">
        ${providers
          .map(
            (p) => `
            <div class="wallet-option" data-provider-id="${p.id}">
              ${p.icon ? `<img src="${p.icon}" alt="${p.name}">` : ''}
              <span>${p.name}</span>
            </div>
          `
          )
          .join('')}
      </div>
    `;

  modal.innerHTML = `
    <h2>Connect Wallet</h2>
    ${providersHtml}
    <div class="modal-buttons" style="margin-top: 16px;">
      <button class="btn btn-secondary" id="cancel-wallet-btn">Cancel</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  // Provider selection handlers
  const options = modal.querySelectorAll('.wallet-option');
  options.forEach((option) => {
    option.addEventListener('click', () => {
      const providerId = (option as HTMLElement).dataset.providerId;
      if (providerId) {
        close();
        onSelectProvider(providerId);
      }
    });
  });

  // Close handlers
  const cancelBtn = modal.querySelector('#cancel-wallet-btn');
  cancelBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  function close() {
    overlay.remove();
  }

  return close;
}

// Show loading modal
export function showLoadingModal(message: string): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>${message}</h2>
    <div style="display: flex; justify-content: center; margin-top: 16px;">
      <div class="spinner"></div>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  function close() {
    overlay.remove();
  }

  return close;
}

// Show error modal
export function showErrorModal(message: string): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>Error</h2>
    <p>${message}</p>
    <div class="modal-buttons">
      <button class="btn btn-secondary" id="error-close-btn">Close</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  const closeBtn = modal.querySelector('#error-close-btn');
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  function close() {
    overlay.remove();
  }

  return close;
}

// Show success modal
export function showSuccessModal(
  title: string,
  message: string
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="modal-buttons">
      <button class="btn btn-primary" id="success-close-btn">OK</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  const closeBtn = modal.querySelector('#success-close-btn');
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  function close() {
    overlay.remove();
  }

  return close;
}

// Show instructions/help modal
export function showInstructionsModal(): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>How to Play</h2>
    <div class="instructions-content">
      <div class="instruction-item">
        <div class="instruction-tiles">
          <span class="mini-tile blue">1</span>
          <span class="instruction-plus">+</span>
          <span class="mini-tile red">2</span>
          <span class="instruction-equals">=</span>
          <span class="mini-tile white">3</span>
        </div>
        <p>1 and 2 combine to make 3</p>
      </div>
      <div class="instruction-item">
        <div class="instruction-tiles">
          <span class="mini-tile white">3</span>
          <span class="instruction-plus">+</span>
          <span class="mini-tile white">3</span>
          <span class="instruction-equals">=</span>
          <span class="mini-tile white">6</span>
        </div>
        <p>Matching numbers (3+) combine into their sum</p>
      </div>
      <div class="instruction-item">
        <p><strong>Swipe</strong> or use <strong>arrow keys</strong> to push all tiles against a wall.</p>
      </div>
      <div class="instruction-item">
        <p>A new tile appears after each move. Keep combining to reach higher numbers!</p>
      </div>
    </div>
    <div class="modal-buttons">
      <button class="btn btn-primary" id="instructions-close-btn">Got it!</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  const closeBtn = modal.querySelector('#instructions-close-btn');
  closeBtn?.addEventListener('click', close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  function close() {
    overlay.remove();
  }

  return close;
}
