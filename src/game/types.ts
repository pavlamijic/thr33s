// Tile values: 0 = empty, 1, 2, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536, 3072, 6144...
export type TileValue = number;

export type Direction = 'up' | 'down' | 'left' | 'right';

// 4x4 grid where each cell contains a tile value
export type Board = TileValue[][];

// Position on the board
export interface Position {
  row: number;
  col: number;
}

// Represents a tile that moved during a turn
export interface MovedTile {
  from: Position;
  to: Position;
  value: TileValue;
  merged: boolean; // true if this tile merged with another
}

// Result of generating a new board state after a move
export interface MoveResult {
  board: Board;
  moved: MovedTile[];
  newTilePosition: Position | null;
}

// Current game state
export interface GameState {
  board: Board;
  nextTile: TileValue;
  deck: TileValue[];
  currentDeck: TileValue[];
  score: number;
  highestTile: TileValue;
  moveCount: number;
  isGameOver: boolean;
}

// Tile appearance types for styling
export type TileClass = 'blue' | 'red' | 'white' | 'bonus';

// Direction key codes
export const KEY_CODES: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

// Default starting deck
export const DEFAULT_DECK: TileValue[] = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];

// Grid dimensions
export const GRID_SIZE = 4;
export const INITIAL_TILE_COUNT = 9;
