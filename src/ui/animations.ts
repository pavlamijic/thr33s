import type { Direction, MovedTile, Position } from '../game/types';
import type { GameRenderer } from './renderer';
import { getTileClass } from '../game/tile-deck';

// Animation duration in milliseconds
const MOVE_DURATION = 150;

// Get the offset direction for new tiles entering
function getEntryOffset(direction: Direction): { rowOffset: number; colOffset: number } {
  switch (direction) {
    case 'left':
      return { rowOffset: 0, colOffset: 1 }; // Enter from right
    case 'right':
      return { rowOffset: 0, colOffset: -1 }; // Enter from left
    case 'up':
      return { rowOffset: 1, colOffset: 0 }; // Enter from bottom
    case 'down':
      return { rowOffset: -1, colOffset: 0 }; // Enter from top
  }
}

// Get CSS pixel position for a tile
function getTilePosition(row: number, col: number): { left: number; top: number } {
  const style = getComputedStyle(document.documentElement);
  const tileSize = parseInt(style.getPropertyValue('--tile-size')) || 80;
  const tileGap = parseInt(style.getPropertyValue('--tile-gap')) || 8;
  const boardPadding = parseInt(style.getPropertyValue('--board-padding')) || 12;

  return {
    left: boardPadding + col * (tileSize + tileGap),
    top: boardPadding + row * (tileSize + tileGap),
  };
}

export class AnimationController {
  private renderer: GameRenderer;
  private isAnimating = false;

  constructor(renderer: GameRenderer) {
    this.renderer = renderer;
  }

  // Check if animations are in progress
  isPlaying(): boolean {
    return this.isAnimating;
  }

  // Animate tiles moving
  async animateMove(moved: MovedTile[]): Promise<void> {
    if (moved.length === 0) return;

    this.isAnimating = true;

    // Process all moved tiles
    const animations: Promise<void>[] = [];

    for (const m of moved) {
      const tile = this.renderer.getTileAt(m.from.row, m.from.col);
      if (!tile) continue;

      // Create animation promise
      const animPromise = new Promise<void>((resolve) => {
        // Calculate target position
        const targetPos = getTilePosition(m.to.row, m.to.col);

        // Apply the transform for animation
        tile.style.left = `${targetPos.left}px`;
        tile.style.top = `${targetPos.top}px`;

        // Wait for transition to complete
        const onTransitionEnd = () => {
          tile.removeEventListener('transitionend', onTransitionEnd);
          resolve();
        };

        tile.addEventListener('transitionend', onTransitionEnd);

        // Fallback in case transitionend doesn't fire
        setTimeout(() => {
          tile.removeEventListener('transitionend', onTransitionEnd);
          resolve();
        }, MOVE_DURATION + 50);
      });

      animations.push(animPromise);
    }

    // Wait for all animations to complete
    await Promise.all(animations);
    this.isAnimating = false;
  }

  // Animate a new tile entering from the edge
  async animateNewTile(
    position: Position,
    value: number,
    direction: Direction
  ): Promise<void> {
    const boardElement = document.getElementById('game-board')!;

    // Calculate entry position (off the board)
    const offset = getEntryOffset(direction);
    const startRow = position.row + offset.rowOffset;
    const startCol = position.col + offset.colOffset;
    const startPos = getTilePosition(startRow, startCol);
    const endPos = getTilePosition(position.row, position.col);

    // Create tile at starting position
    const tile = document.createElement('div');
    tile.className = `tile ${getTileClass(value)}`;
    tile.textContent = value.toString();
    tile.style.left = `${startPos.left}px`;
    tile.style.top = `${startPos.top}px`;
    tile.dataset.row = position.row.toString();
    tile.dataset.col = position.col.toString();

    boardElement.appendChild(tile);

    // Force reflow to ensure the starting position is applied
    tile.offsetHeight;

    // Animate to final position
    return new Promise<void>((resolve) => {
      tile.style.left = `${endPos.left}px`;
      tile.style.top = `${endPos.top}px`;

      const onTransitionEnd = () => {
        tile.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      };

      tile.addEventListener('transitionend', onTransitionEnd);

      setTimeout(() => {
        tile.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      }, MOVE_DURATION + 50);
    });
  }

  // Add merge animation to a tile
  animateMerge(tile: HTMLElement): void {
    tile.classList.add('merging');
    tile.addEventListener('animationend', () => {
      tile.classList.remove('merging');
    }, { once: true });
  }
}
