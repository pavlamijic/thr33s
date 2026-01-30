import type { Direction } from '../game/types';

// Minimum distance for a swipe to be recognized
const SWIPE_THRESHOLD = 50;

export type SwipeHandler = (direction: Direction) => void;

export class TouchController {
  private element: HTMLElement;
  private handler: SwipeHandler;
  private startX = 0;
  private startY = 0;
  private isTracking = false;

  constructor(element: HTMLElement, handler: SwipeHandler) {
    this.element = element;
    this.handler = handler;
    this.bindEvents();
  }

  private bindEvents(): void {
    // Touch events
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this), {
      passive: false,
    });
    this.element.addEventListener('touchcancel', this.onTouchCancel.bind(this));

    // Mouse events (for desktop testing)
    this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;

    e.preventDefault();
    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.isTracking = true;
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.isTracking) return;
    e.preventDefault();
  }

  private onTouchEnd(e: TouchEvent): void {
    if (!this.isTracking) return;

    const touch = e.changedTouches[0];
    this.processSwipe(touch.clientX, touch.clientY);
    this.isTracking = false;
  }

  private onTouchCancel(): void {
    this.isTracking = false;
  }

  private onMouseDown(e: MouseEvent): void {
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.isTracking = true;
  }

  private onMouseMove(_e: MouseEvent): void {
    if (!this.isTracking) return;
    // Could add visual feedback here
  }

  private onMouseUp(e: MouseEvent): void {
    if (!this.isTracking) return;

    this.processSwipe(e.clientX, e.clientY);
    this.isTracking = false;
  }

  private processSwipe(endX: number, endY: number): void {
    const deltaX = endX - this.startX;
    const deltaY = endY - this.startY;

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    // Check if the swipe distance is sufficient
    if (absDeltaX < SWIPE_THRESHOLD && absDeltaY < SWIPE_THRESHOLD) {
      return;
    }

    // Determine swipe direction
    let direction: Direction;

    if (absDeltaX > absDeltaY) {
      // Horizontal swipe
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      // Vertical swipe
      direction = deltaY > 0 ? 'down' : 'up';
    }

    this.handler(direction);
  }

  // Clean up event listeners
  destroy(): void {
    document.removeEventListener('mousemove', this.onMouseMove.bind(this));
    document.removeEventListener('mouseup', this.onMouseUp.bind(this));
  }
}
