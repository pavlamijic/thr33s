import {
  type GameState,
  type Board,
  type Direction,
  type MovedTile,
  type Position,
  INITIAL_TILE_COUNT,
} from './types';
import { TileDeck } from './tile-deck';
import { calculateScore, getHighestTile } from './scoring';
import {
  createEmptyBoard,
  generateNewBoard,
  getNewTilePositions,
  pickNewTilePosition,
  checkGameOver,
  getRandomPositions,
} from './logic';

export type GameEventType =
  | 'move'
  | 'newTile'
  | 'gameOver'
  | 'newGame'
  | 'scoreUpdate';

export interface GameEvent {
  type: GameEventType;
  data?: {
    moved?: MovedTile[];
    direction?: Direction;
    newTilePosition?: Position | null;
    newTileValue?: number;
    score?: number;
    highestTile?: number;
  };
}

type GameEventListener = (event: GameEvent) => void;

export class GameStateManager {
  private state: GameState;
  private deck: TileDeck;
  private listeners: GameEventListener[] = [];

  constructor() {
    this.deck = new TileDeck();
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    const board = createEmptyBoard();
    const deckState = this.deck.getState();

    return {
      board,
      nextTile: 0,
      deck: deckState.deck,
      currentDeck: deckState.currentDeck,
      score: 0,
      highestTile: 0,
      moveCount: 0,
      isGameOver: false,
    };
  }

  // Subscribe to game events
  subscribe(listener: GameEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // Start a new game
  newGame(): void {
    this.deck.reset();
    const board = createEmptyBoard();

    // Place initial tiles (9 random positions)
    const positions = getRandomPositions(INITIAL_TILE_COUNT);
    for (const pos of positions) {
      board[pos.row][pos.col] = this.deck.draw(board);
    }

    // Generate next tile
    const nextTile = this.deck.draw(board);
    const deckState = this.deck.getState();

    this.state = {
      board,
      nextTile,
      deck: deckState.deck,
      currentDeck: deckState.currentDeck,
      score: calculateScore(board),
      highestTile: getHighestTile(board),
      moveCount: 0,
      isGameOver: false,
    };

    this.emit({ type: 'newGame' });
    this.emit({
      type: 'scoreUpdate',
      data: {
        score: this.state.score,
        highestTile: this.state.highestTile,
      },
    });
  }

  // Make a move in a direction
  move(direction: Direction): boolean {
    if (this.state.isGameOver) return false;

    const { board: newBoard, moved } = generateNewBoard(
      this.state.board,
      direction
    );

    // No tiles moved - invalid move
    if (moved.length === 0) return false;

    // Update board
    this.state.board = newBoard;

    // Emit move event for animation
    this.emit({
      type: 'move',
      data: { moved, direction },
    });

    // Get position for new tile
    const possiblePositions = getNewTilePositions(
      this.state.board,
      moved,
      direction
    );
    const newTilePosition = pickNewTilePosition(possiblePositions);

    // Insert new tile
    if (newTilePosition) {
      this.state.board[newTilePosition.row][newTilePosition.col] =
        this.state.nextTile;

      this.emit({
        type: 'newTile',
        data: {
          newTilePosition,
          newTileValue: this.state.nextTile,
          direction,
        },
      });
    }

    // Draw next tile
    this.state.nextTile = this.deck.draw(this.state.board);
    const deckState = this.deck.getState();
    this.state.deck = deckState.deck;
    this.state.currentDeck = deckState.currentDeck;

    // Update score and highest tile
    this.state.score = calculateScore(this.state.board);
    this.state.highestTile = getHighestTile(this.state.board);
    this.state.moveCount++;

    this.emit({
      type: 'scoreUpdate',
      data: {
        score: this.state.score,
        highestTile: this.state.highestTile,
      },
    });

    // Check for game over
    if (checkGameOver(this.state.board)) {
      this.state.isGameOver = true;
      this.emit({
        type: 'gameOver',
        data: {
          score: this.state.score,
          highestTile: this.state.highestTile,
        },
      });
    }

    return true;
  }

  // Get current state (read-only)
  getState(): Readonly<GameState> {
    return this.state;
  }

  // Get the board
  getBoard(): Board {
    return this.state.board;
  }

  // Get next tile
  getNextTile(): number {
    return this.state.nextTile;
  }

  // Get score
  getScore(): number {
    return this.state.score;
  }

  // Get highest tile
  getHighestTile(): number {
    return this.state.highestTile;
  }

  // Check if game is over
  isGameOver(): boolean {
    return this.state.isGameOver;
  }
}
