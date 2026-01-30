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
  personalBest: number | null
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
              <tr class="${entry.address === currentAddress ? 'highlight' : ''}">
                <td>${entry.rank}</td>
                <td class="leaderboard-address">${truncateAddress(entry.address)}</td>
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
