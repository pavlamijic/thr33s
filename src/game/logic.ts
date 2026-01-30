import { type Board, type Direction, type MovedTile, type Position, GRID_SIZE } from './types';

// Deep copy a board
export function copyBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

// Create an empty board
export function createEmptyBoard(): Board {
  return Array(GRID_SIZE)
    .fill(null)
    .map(() => Array(GRID_SIZE).fill(0));
}

// Check if two tiles can combine
function canCombine(tile1: number, tile2: number): boolean {
  // Can't combine with empty
  if (tile1 === 0 || tile2 === 0) return false;

  // 1 + 2 = 3
  if ((tile1 === 1 && tile2 === 2) || (tile1 === 2 && tile2 === 1)) {
    return true;
  }

  // Twins (3+3, 6+6, etc.) but not 1+1 or 2+2
  if (tile1 === tile2 && tile1 >= 3) {
    return true;
  }

  return false;
}

// Get the result of combining two tiles
function getCombinedValue(tile1: number, tile2: number): number {
  if (tile1 === 1 && tile2 === 2) return 3;
  if (tile1 === 2 && tile2 === 1) return 3;
  if (tile1 === tile2 && tile1 >= 3) return tile1 * 2;
  return 0;
}

// Generate new board state after a move
export function generateNewBoard(
  board: Board,
  direction: Direction
): { board: Board; moved: MovedTile[] } {
  const newBoard = copyBoard(board);
  const moved: MovedTile[] = [];

  const attemptTileMove = (
    i: number,
    j: number,
    iPrev: number,
    jPrev: number
  ): void => {
    const currentTile = newBoard[i][j];
    const targetTile = newBoard[iPrev][jPrev];

    // Empty space - nothing to move
    if (currentTile === 0) return;

    // Target is empty - slide into it
    if (targetTile === 0) {
      newBoard[iPrev][jPrev] = currentTile;
      newBoard[i][j] = 0;
      moved.push({
        from: { row: i, col: j },
        to: { row: iPrev, col: jPrev },
        value: currentTile,
        merged: false,
      });
      return;
    }

    // Check if tiles can combine
    if (canCombine(currentTile, targetTile)) {
      const combinedValue = getCombinedValue(currentTile, targetTile);
      newBoard[iPrev][jPrev] = combinedValue;
      newBoard[i][j] = 0;
      moved.push({
        from: { row: i, col: j },
        to: { row: iPrev, col: jPrev },
        value: combinedValue,
        merged: true,
      });
    }
  };

  switch (direction) {
    case 'left':
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 1; j < GRID_SIZE; j++) {
          attemptTileMove(i, j, i, j - 1);
        }
      }
      break;

    case 'right':
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = GRID_SIZE - 2; j >= 0; j--) {
          attemptTileMove(i, j, i, j + 1);
        }
      }
      break;

    case 'up':
      for (let j = 0; j < GRID_SIZE; j++) {
        for (let i = 1; i < GRID_SIZE; i++) {
          attemptTileMove(i, j, i - 1, j);
        }
      }
      break;

    case 'down':
      for (let j = 0; j < GRID_SIZE; j++) {
        for (let i = GRID_SIZE - 2; i >= 0; i--) {
          attemptTileMove(i, j, i + 1, j);
        }
      }
      break;
  }

  return { board: newBoard, moved };
}

// Get possible positions for inserting a new tile after a move
export function getNewTilePositions(
  board: Board,
  moved: MovedTile[],
  direction: Direction
): Position[] {
  const positions: Position[] = [];

  // Get unique rows/cols that had movement
  const movedRows = new Set(moved.map((m) => m.from.row));
  const movedCols = new Set(moved.map((m) => m.from.col));

  switch (direction) {
    case 'left':
      // New tile comes from right column (j=3)
      for (const row of movedRows) {
        if (board[row][GRID_SIZE - 1] === 0) {
          positions.push({ row, col: GRID_SIZE - 1 });
        }
      }
      break;

    case 'right':
      // New tile comes from left column (j=0)
      for (const row of movedRows) {
        if (board[row][0] === 0) {
          positions.push({ row, col: 0 });
        }
      }
      break;

    case 'up':
      // New tile comes from bottom row (i=3)
      for (const col of movedCols) {
        if (board[GRID_SIZE - 1][col] === 0) {
          positions.push({ row: GRID_SIZE - 1, col });
        }
      }
      break;

    case 'down':
      // New tile comes from top row (i=0)
      for (const col of movedCols) {
        if (board[0][col] === 0) {
          positions.push({ row: 0, col });
        }
      }
      break;
  }

  return positions;
}

// Pick a random position for the new tile
export function pickNewTilePosition(positions: Position[]): Position | null {
  if (positions.length === 0) return null;
  return positions[Math.floor(Math.random() * positions.length)];
}

// Check if the game is over (no valid moves)
export function checkGameOver(board: Board): boolean {
  // Check for empty spaces
  for (const row of board) {
    for (const tile of row) {
      if (tile === 0) return false;
    }
  }

  // Check for valid moves in all directions
  const directions: Direction[] = ['up', 'down', 'left', 'right'];
  for (const direction of directions) {
    const { moved } = generateNewBoard(board, direction);
    if (moved.length > 0) return false;
  }

  return true;
}

// Get random unique positions for initial tiles
export function getRandomPositions(count: number): Position[] {
  const positions: Position[] = [];
  const used = new Set<string>();

  while (positions.length < count) {
    const row = Math.floor(Math.random() * GRID_SIZE);
    const col = Math.floor(Math.random() * GRID_SIZE);
    const key = `${row},${col}`;

    if (!used.has(key)) {
      used.add(key);
      positions.push({ row, col });
    }
  }

  return positions;
}
