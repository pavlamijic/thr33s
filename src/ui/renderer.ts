import { type Board, type TileValue, GRID_SIZE } from '../game/types';
import { getTileClass } from '../game/tile-deck';

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

// Create a tile DOM element
function createTileElement(value: TileValue, row: number, col: number, isHighest: boolean = false): HTMLElement {
  const tile = document.createElement('div');
  tile.className = `tile ${getTileClass(value)}${isHighest ? ' highest' : ''}`;
  tile.textContent = value.toString();
  tile.dataset.row = row.toString();
  tile.dataset.col = col.toString();
  tile.dataset.value = value.toString();

  const pos = getTilePosition(row, col);
  tile.style.left = `${pos.left}px`;
  tile.style.top = `${pos.top}px`;

  return tile;
}

// Find the highest tile value on the board (only tiles > 3)
function findHighestValue(board: Board): number {
  let highest = 0;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const value = board[row][col];
      if (value > 3 && value > highest) {
        highest = value;
      }
    }
  }
  return highest;
}

// Create empty cell background elements
function createCellBackgrounds(): HTMLElement[] {
  const cells: HTMLElement[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell-bg';
      cell.style.setProperty('--row', (row + 1).toString());
      cell.style.setProperty('--col', (col + 1).toString());
      cells.push(cell);
    }
  }
  return cells;
}

export class GameRenderer {
  private boardElement: HTMLElement;
  private nextTileElement: HTMLElement;
  private scoreElement: HTMLElement;
  private tiles: Map<string, HTMLElement> = new Map();

  constructor() {
    this.boardElement = document.getElementById('game-board')!;
    this.nextTileElement = document.getElementById('next-tile')!;
    this.scoreElement = document.getElementById('score')!;

    // Create cell backgrounds
    const cells = createCellBackgrounds();
    cells.forEach((cell) => this.boardElement.appendChild(cell));
  }

  // Generate a unique key for a tile position
  private getTileKey(row: number, col: number): string {
    return `${row}-${col}`;
  }

  // Render the entire board
  renderBoard(board: Board): void {
    // Clear existing tiles
    this.tiles.forEach((tile) => tile.remove());
    this.tiles.clear();

    // Find the highest value on the board
    const highestValue = findHighestValue(board);

    // Create new tiles
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const value = board[row][col];
        if (value !== 0) {
          const isHighest = value > 3 && value === highestValue;
          const tile = createTileElement(value, row, col, isHighest);
          this.boardElement.appendChild(tile);
          this.tiles.set(this.getTileKey(row, col), tile);
        }
      }
    }
  }

  // Update a single tile's position and value
  updateTile(row: number, col: number, value: TileValue): void {
    const key = this.getTileKey(row, col);
    let tile = this.tiles.get(key);

    if (value === 0) {
      // Remove tile if it exists
      if (tile) {
        tile.remove();
        this.tiles.delete(key);
      }
      return;
    }

    if (!tile) {
      // Create new tile
      tile = createTileElement(value, row, col);
      this.boardElement.appendChild(tile);
      this.tiles.set(key, tile);
    } else {
      // Update existing tile
      tile.textContent = value.toString();
      tile.className = `tile ${getTileClass(value)}`;
    }
  }

  // Move a tile from one position to another
  moveTile(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    newValue: TileValue
  ): HTMLElement | null {
    const fromKey = this.getTileKey(fromRow, fromCol);
    const toKey = this.getTileKey(toRow, toCol);
    const tile = this.tiles.get(fromKey);

    if (!tile) return null;

    // Update the tile's position
    const pos = getTilePosition(toRow, toCol);
    tile.style.left = `${pos.left}px`;
    tile.style.top = `${pos.top}px`;
    tile.dataset.row = toRow.toString();
    tile.dataset.col = toCol.toString();

    // Update value if it changed (merge)
    if (newValue !== parseInt(tile.textContent || '0')) {
      tile.textContent = newValue.toString();
      tile.className = `tile ${getTileClass(newValue)}`;
    }

    // Update the tile map
    this.tiles.delete(fromKey);
    this.tiles.set(toKey, tile);

    return tile;
  }

  // Add a new tile with animation
  addNewTile(row: number, col: number, value: TileValue): HTMLElement {
    const tile = createTileElement(value, row, col);
    tile.classList.add('entering');
    this.boardElement.appendChild(tile);
    this.tiles.set(this.getTileKey(row, col), tile);

    // Remove animation class after it completes
    tile.addEventListener('animationend', () => {
      tile.classList.remove('entering');
    }, { once: true });

    return tile;
  }

  // Remove a tile at a position (for merges)
  removeTile(row: number, col: number): void {
    const key = this.getTileKey(row, col);
    const tile = this.tiles.get(key);
    if (tile) {
      tile.remove();
      this.tiles.delete(key);
    }
  }

  // Get tile element at position
  getTileAt(row: number, col: number): HTMLElement | undefined {
    return this.tiles.get(this.getTileKey(row, col));
  }

  // Render next tile preview
  renderNextTile(value: TileValue): void {
    this.nextTileElement.textContent = value.toString();
    this.nextTileElement.className = `next-tile-preview ${getTileClass(value)}`;
  }

  // Update score display
  updateScore(score: number): void {
    this.scoreElement.textContent = score.toString();
  }
}
