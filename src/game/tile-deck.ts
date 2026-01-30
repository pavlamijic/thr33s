import { type TileValue, type Board, DEFAULT_DECK } from './types';

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Get the highest tile value on the board
function getHighestTile(board: Board): TileValue {
  let highest = 0;
  for (const row of board) {
    for (const tile of row) {
      if (tile > highest) {
        highest = tile;
      }
    }
  }
  return highest;
}

// Generate bonus tile deck based on highest tile
// Bonus tiles are 6, 12, 24... up to (highest / 8)
function getBonusDeck(highestTile: TileValue): TileValue[] {
  if (highestTile < 48) return [];

  const bonusTiles: TileValue[] = [];
  // size = log2(highest/3) - 3
  // This gives us tiles from 6 up to highest/8
  const size = Math.floor(Math.log2(highestTile / 3)) - 3;

  for (let n = 0; n < size; n++) {
    bonusTiles.push(6 * Math.pow(2, n));
  }

  return bonusTiles;
}

export class TileDeck {
  private baseDeck: TileValue[];
  private currentDeck: TileValue[];

  constructor() {
    this.baseDeck = [...DEFAULT_DECK];
    this.currentDeck = [];
  }

  // Draw a random tile, considering bonus tiles
  draw(board: Board): TileValue {
    const highestTile = getHighestTile(board);

    // 1/21 chance of bonus tile when highest >= 48
    if (highestTile >= 48 && Math.random() <= 1 / 21) {
      const bonusDeck = getBonusDeck(highestTile);
      if (bonusDeck.length > 0) {
        const bonusTile = bonusDeck[Math.floor(Math.random() * bonusDeck.length)];
        return bonusTile;
      }
    }

    // Normal draw from deck
    if (this.currentDeck.length === 0) {
      this.currentDeck = shuffle(this.baseDeck);
    }

    return this.currentDeck.shift()!;
  }

  // Reset the deck
  reset(): void {
    this.currentDeck = [];
  }

  // Get current deck state (for state persistence)
  getState(): { deck: TileValue[]; currentDeck: TileValue[] } {
    return {
      deck: [...this.baseDeck],
      currentDeck: [...this.currentDeck],
    };
  }

  // Restore deck state
  setState(deck: TileValue[], currentDeck: TileValue[]): void {
    this.baseDeck = [...deck];
    this.currentDeck = [...currentDeck];
  }
}

// Get tile visual class
export function getTileClass(tile: TileValue): string {
  if (tile === 1) return 'blue';
  if (tile === 2) return 'red';
  if (tile === 3) return 'white';
  return 'bonus'; // 6, 12, 24, etc.
}
