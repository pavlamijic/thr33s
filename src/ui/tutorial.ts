const TUTORIAL_STORAGE_KEY = 'thr33s_hints_shown';

interface HintState {
  initial: boolean;
  firstMove: boolean;
  match12: boolean;
  matchTwins: boolean;
  highNumber: boolean;
}

export class TutorialController {
  private hintElement: HTMLElement | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;
  private state: HintState;
  private moveCount = 0;
  private isActive = false;

  constructor() {
    // Load which hints have been shown
    const saved = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    this.state = saved ? JSON.parse(saved) : {
      initial: false,
      firstMove: false,
      match12: false,
      matchTwins: false,
      highNumber: false,
    };
  }

  private saveState(): void {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(this.state));
  }

  private allHintsShown(): boolean {
    return this.state.initial && this.state.firstMove &&
           this.state.match12 && this.state.matchTwins;
  }

  start(): void {
    if (this.allHintsShown()) {
      return;
    }

    this.isActive = true;
    this.createHintElement();

    // Show initial hint after a brief delay
    if (!this.state.initial) {
      setTimeout(() => {
        this.showHint('Swipe or use arrow keys to move tiles', 4000);
        this.state.initial = true;
        this.saveState();
      }, 500);
    }
  }

  private createHintElement(): void {
    if (this.hintElement) return;

    this.hintElement = document.createElement('div');
    this.hintElement.className = 'game-hint';
    this.hintElement.setAttribute('aria-live', 'polite');

    // Insert above the board
    const boardWrapper = document.querySelector('.board-wrapper');
    if (boardWrapper) {
      boardWrapper.insertBefore(this.hintElement, boardWrapper.firstChild);
    }
  }

  private showHint(message: string, duration: number = 3000): void {
    if (!this.hintElement) return;

    // Clear any existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    // Update message and show
    this.hintElement.textContent = message;
    this.hintElement.classList.remove('hint-hidden');
    this.hintElement.classList.add('hint-visible');

    // Auto-hide after duration
    this.hideTimeout = setTimeout(() => {
      this.hideHint();
    }, duration);
  }

  private hideHint(): void {
    if (!this.hintElement) return;
    this.hintElement.classList.remove('hint-visible');
    this.hintElement.classList.add('hint-hidden');
  }

  // Called when a move is made
  onMove(): void {
    if (!this.isActive) return;

    this.moveCount++;

    // After first successful move
    if (this.moveCount === 1 && !this.state.firstMove) {
      setTimeout(() => {
        this.showHint('New tiles appear after each move', 3000);
        this.state.firstMove = true;
        this.saveState();
      }, 300);
    }

    // Encourage after a few moves
    if (this.moveCount === 3 && this.state.firstMove && !this.state.match12 && !this.state.matchTwins) {
      setTimeout(() => {
        this.showHint('Combine 1 + 2 to make 3', 3500);
      }, 300);
    }
  }

  // Called when 1+2 match happens
  onMatch12(): void {
    if (!this.isActive) return;

    if (!this.state.match12) {
      setTimeout(() => {
        this.showHint('Nice! 1 and 2 always make 3', 3000);
        this.state.match12 = true;
        this.saveState();

        // Follow up hint about twins
        if (!this.state.matchTwins) {
          setTimeout(() => {
            this.showHint('Match twins: 3+3, 6+6, 12+12...', 4000);
          }, 3500);
        }
      }, 200);
    }
  }

  // Called when twins match (3+3, 6+6, etc.)
  onMatchTwins(): void {
    if (!this.isActive) return;

    if (!this.state.matchTwins) {
      setTimeout(() => {
        this.showHint('Excellent! Keep combining twins!', 2500);
        this.state.matchTwins = true;
        this.saveState();
      }, 200);
    }
  }

  // Called when reaching a high tile (e.g., 48+)
  onHighTile(value: number): void {
    if (!this.isActive) return;

    if (value >= 48 && !this.state.highNumber) {
      setTimeout(() => {
        this.showHint(`${value}! You're getting good!`, 2500);
        this.state.highNumber = true;
        this.saveState();
      }, 300);
    }
  }

  isRunning(): boolean {
    return this.isActive;
  }

  // Skip remaining hints
  skip(): void {
    this.state = {
      initial: true,
      firstMove: true,
      match12: true,
      matchTwins: true,
      highNumber: true,
    };
    this.saveState();
    this.isActive = false;
    this.hideHint();
  }

  // Reset hints (for testing)
  static reset(): void {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  }
}
