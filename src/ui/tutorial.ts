export interface TutorialStep {
  message: string;
  condition?: 'move' | 'match12' | 'matchTwins' | 'reach24' | 'gameOver';
  highlight?: string; // CSS selector to highlight
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    message: "Meet 1 & 2",
  },
  {
    message: "Rearrange numbers by pushing them into a wall",
  },
  {
    message: "Use keyboard arrows or swipe to move them",
    condition: 'move',
  },
  {
    message: "New numbers will appear when you move the cards",
  },
  {
    message: "3 + 3 = 6",
  },
  {
    message: "You're getting it!",
    condition: 'move',
  },
  {
    message: "Numbers 3 and higher will only add together if they are twins",
    condition: 'matchTwins',
  },
  {
    message: "Fantastic!",
  },
  {
    message: "1 will only add with 2",
  },
  {
    message: "2 will only add with 1",
    condition: 'match12',
  },
  {
    message: "Make the highest number you can!",
  },
];

const TUTORIAL_STORAGE_KEY = 'thr33s_tutorial_completed';

export class TutorialController {
  private currentStep = 0;
  private overlay: HTMLElement | null = null;
  private messageElement: HTMLElement | null = null;
  private isActive = false;
  private moveCount = 0;
  private onComplete: (() => void) | null = null;

  constructor() {
    // Check if tutorial was already completed
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (completed === 'true') {
      this.isActive = false;
    }
  }

  shouldShowTutorial(): boolean {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'true';
  }

  start(onComplete?: () => void): void {
    if (!this.shouldShowTutorial()) {
      onComplete?.();
      return;
    }

    this.isActive = true;
    this.currentStep = 0;
    this.moveCount = 0;
    this.onComplete = onComplete || null;

    this.createOverlay();
    this.showStep();
  }

  private createOverlay(): void {
    // Remove existing overlay if any
    this.removeOverlay();

    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.innerHTML = `
      <div class="tutorial-message-container">
        <p class="tutorial-message"></p>
        <button class="tutorial-next-btn">Tap to continue</button>
        <button class="tutorial-skip-btn">Skip tutorial</button>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.messageElement = this.overlay.querySelector('.tutorial-message');

    // Add event listeners
    const nextBtn = this.overlay.querySelector('.tutorial-next-btn');
    const skipBtn = this.overlay.querySelector('.tutorial-skip-btn');

    nextBtn?.addEventListener('click', () => this.handleTap());
    skipBtn?.addEventListener('click', () => this.skip());

    // Also allow tapping anywhere on overlay
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.handleTap();
      }
    });
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      this.messageElement = null;
    }
  }

  private showStep(): void {
    if (!this.messageElement || this.currentStep >= TUTORIAL_STEPS.length) {
      this.complete();
      return;
    }

    const step = TUTORIAL_STEPS[this.currentStep];
    this.messageElement.textContent = step.message;
    this.messageElement.classList.add('tutorial-fade-in');

    // Update button visibility based on condition
    const nextBtn = this.overlay?.querySelector('.tutorial-next-btn') as HTMLElement;
    if (nextBtn) {
      if (step.condition) {
        nextBtn.textContent = this.getConditionHint(step.condition);
        nextBtn.style.opacity = '0.7';
      } else {
        nextBtn.textContent = 'Tap to continue';
        nextBtn.style.opacity = '1';
      }
    }

    // If step has a condition, hide overlay after a brief moment so user can interact with game
    if (step.condition && this.overlay) {
      setTimeout(() => {
        this.hideOverlay();
      }, 1500); // Show message briefly, then hide to let user play
    }
  }

  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      this.overlay.style.pointerEvents = 'none';
    }
  }

  private showOverlay(): void {
    if (this.overlay) {
      this.overlay.style.opacity = '1';
      this.overlay.style.pointerEvents = 'auto';
    }
  }

  private getConditionHint(condition: string): string {
    switch (condition) {
      case 'move':
        return 'Try moving the tiles';
      case 'match12':
        return 'Match a 1 with a 2';
      case 'matchTwins':
        return 'Match two same numbers';
      default:
        return 'Keep playing';
    }
  }

  private handleTap(): void {
    const step = TUTORIAL_STEPS[this.currentStep];

    // If there's no condition, advance immediately
    if (!step?.condition) {
      this.nextStep();
    }
    // Otherwise, wait for the condition to be met
  }

  private nextStep(): void {
    this.currentStep++;

    if (this.currentStep >= TUTORIAL_STEPS.length) {
      this.complete();
    } else {
      // Show overlay again for next message
      this.showOverlay();
      if (this.messageElement) {
        this.messageElement.classList.remove('tutorial-fade-in');
        setTimeout(() => this.showStep(), 100);
      }
    }
  }

  // Call this when a move is made
  onMove(): void {
    if (!this.isActive) return;

    this.moveCount++;
    const step = TUTORIAL_STEPS[this.currentStep];

    if (step?.condition === 'move' && this.moveCount >= 1) {
      setTimeout(() => this.nextStep(), 500);
    }
  }

  // Call this when 1+2 match happens
  onMatch12(): void {
    if (!this.isActive) return;

    const step = TUTORIAL_STEPS[this.currentStep];
    if (step?.condition === 'match12') {
      setTimeout(() => this.nextStep(), 500);
    }
  }

  // Call this when twins match (3+3, 6+6, etc.)
  onMatchTwins(): void {
    if (!this.isActive) return;

    const step = TUTORIAL_STEPS[this.currentStep];
    if (step?.condition === 'matchTwins') {
      setTimeout(() => this.nextStep(), 500);
    }
  }

  skip(): void {
    this.complete();
  }

  private complete(): void {
    this.isActive = false;
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    this.removeOverlay();
    this.onComplete?.();
  }

  isRunning(): boolean {
    return this.isActive;
  }

  // Reset tutorial (for testing)
  static reset(): void {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  }
}
