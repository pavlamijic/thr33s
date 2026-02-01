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

// Show game over modal
export function showGameOverModal(
  score: number,
  highestTile: number,
  isWalletConnected: boolean,
  onSubmitScore: () => void,
  onConnectWallet: () => void,
  onPlayAgain: () => void
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>Game Over</h2>
    <div class="modal-score">${score}</div>
    <div class="modal-highest">Highest tile: ${highestTile}</div>
    <div class="modal-buttons">
      ${
        isWalletConnected
          ? '<button class="btn btn-primary" id="submit-score-btn">Submit to Leaderboard</button>'
          : '<button class="btn btn-secondary" id="connect-wallet-btn">Connect Wallet to Submit</button>'
      }
      <button class="btn btn-secondary" id="play-again-btn">Play Again</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  // Button handlers
  const submitBtn = modal.querySelector('#submit-score-btn');
  const connectBtn = modal.querySelector('#connect-wallet-btn');
  const playAgainBtn = modal.querySelector('#play-again-btn');

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      onSubmitScore();
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      onConnectWallet();
    });
  }

  playAgainBtn?.addEventListener('click', () => {
    close();
    onPlayAgain();
  });

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

// Show leaderboard modal
export function showLeaderboardModal(
  entries: LeaderboardEntry[],
  currentAddress: string | null,
  personalBest: number | null,
  getDisplayName?: (address: string) => string
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  // Use provided display name function or fallback to truncate
  const displayName = getDisplayName || truncateAddress;

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
                <td class="leaderboard-player">${displayName(entry.address)}</td>
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

  // Close handlers
  const closeBtn = modal.querySelector('#close-leaderboard-btn');
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

// Show set alias modal
export function showSetAliasModal(
  currentAddress: string,
  currentAlias: string | null,
  onSave: (alias: string) => void
): ModalCloseCallback {
  const modalsContainer = document.getElementById('modals')!;

  const overlay = createModalOverlay();
  const modal = document.createElement('div');
  modal.className = 'modal';

  modal.innerHTML = `
    <h2>Set Your Alias</h2>
    <p class="alias-hint">Choose a nickname to display on the leaderboard instead of your address.</p>
    <div class="alias-input-container">
      <input
        type="text"
        id="alias-input"
        class="alias-input"
        placeholder="Enter alias (max 20 chars)"
        maxlength="20"
        value="${currentAlias || ''}"
      />
      <div class="alias-preview">
        <span class="alias-preview-label">Preview:</span>
        <span id="alias-preview-text">${currentAlias || truncateAddress(currentAddress)}</span>
      </div>
    </div>
    <div class="modal-buttons">
      <button class="btn btn-primary" id="save-alias-btn">Save</button>
      <button class="btn btn-secondary" id="cancel-alias-btn">Cancel</button>
    </div>
  `;

  overlay.appendChild(modal);
  modalsContainer.appendChild(overlay);

  const input = modal.querySelector('#alias-input') as HTMLInputElement;
  const previewText = modal.querySelector('#alias-preview-text')!;
  const saveBtn = modal.querySelector('#save-alias-btn')!;
  const cancelBtn = modal.querySelector('#cancel-alias-btn')!;

  // Update preview as user types
  input.addEventListener('input', () => {
    const value = input.value.trim();
    previewText.textContent = value || truncateAddress(currentAddress);
  });

  // Focus input
  setTimeout(() => input.focus(), 100);

  // Save handler
  saveBtn.addEventListener('click', () => {
    onSave(input.value.trim());
    close();
  });

  // Cancel handler
  cancelBtn.addEventListener('click', close);

  // Enter key to save
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      onSave(input.value.trim());
      close();
    }
    if (e.key === 'Escape') {
      close();
    }
  });

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
