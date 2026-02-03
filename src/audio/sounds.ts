// Sound effects using Web Audio API

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Resume audio context on user interaction (required by browsers)
export function initAudio(): void {
  document.addEventListener('click', () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }, { once: true });

  document.addEventListener('keydown', () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }, { once: true });
}

// Swoosh sound for tile movement
export function playSwoosh(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // White noise-like swoosh
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(400, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);

  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

// Match sound for 1+2 combining - soft woosh
export function playMatch12(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  // Create noise-based woosh using oscillator with fast frequency sweep
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  oscillator.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Bandpass filter for softer woosh character
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12);
  filter.Q.value = 1;

  // Quick frequency sweep down for woosh effect
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(600, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.12);

  // Quick fade in and out
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

// Match sound for twins (3+3, 6+6, etc.)
// Simple soft pop/ding - pitch increases slightly with tile value
export function playMatchTwins(tileValue: number): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  // Calculate level based on tile value (3, 6, 12, 24, 48, 96, etc.)
  const level = Math.log2(tileValue / 3) + 1; // 3->1, 6->2, 12->3, 24->4, etc.

  // Simple single tone - pitch rises gently with tile value
  const freq = 400 + Math.min(level * 40, 200); // 440-600Hz range

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Pure sine wave for clean sound
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

  // Quick attack, smooth decay - like a soft pop
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.18);
}

// Game over sound
export function playGameOver(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  // Descending sad tone
  const notes = [392, 349, 330, 294]; // G4, F4, E4, D4

  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.3);

    oscillator.start(ctx.currentTime + i * 0.2);
    oscillator.stop(ctx.currentTime + i * 0.2 + 0.35);
  });
}

// Achievement/milestone sound (e.g., reaching 24 for the first time)
export function playAchievement(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  // Triumphant fanfare
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4);

    oscillator.start(ctx.currentTime + i * 0.1);
    oscillator.stop(ctx.currentTime + i * 0.1 + 0.45);
  });
}

// Sound settings
let soundEnabled = true;

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  localStorage.setItem('thr33s_sound_enabled', enabled ? 'true' : 'false');
}

export function loadSoundSettings(): void {
  const saved = localStorage.getItem('thr33s_sound_enabled');
  soundEnabled = saved !== 'false'; // Default to enabled
}

// Wrapper functions that respect sound settings
export const sounds = {
  swoosh: () => soundEnabled && playSwoosh(),
  match12: () => soundEnabled && playMatch12(),
  matchTwins: (value: number) => soundEnabled && playMatchTwins(value),
  gameOver: () => soundEnabled && playGameOver(),
  achievement: () => soundEnabled && playAchievement(),
};
