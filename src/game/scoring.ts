import type { Board, TileValue } from './types';

// Calculate score for a single tile
// Formula: 3^(log2(tile/3) + 1) for tiles >= 3
// Tiles 1 and 2 are worth 0 points
export function scoreTile(tile: TileValue): number {
  if (tile < 3) return 0;

  const exponent = Math.log2(tile / 3) + 1;
  return Math.floor(Math.pow(3, exponent));
}

// Calculate total score for the entire board
export function calculateScore(board: Board): number {
  let total = 0;
  for (const row of board) {
    for (const tile of row) {
      total += scoreTile(tile);
    }
  }
  return total;
}

// Get the highest tile on the board
export function getHighestTile(board: Board): TileValue {
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
