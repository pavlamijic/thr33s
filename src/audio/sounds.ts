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

// Match sound for 1+2 combining
export function playMatch12(): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Pleasant ascending tone
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(330, ctx.currentTime); // E4
  oscillator.frequency.setValueAtTime(392, ctx.currentTime + 0.1); // G4

  gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.3);
}

// Match sound for twins (3+3, 6+6, etc.)
// Higher tile values get more exciting sounds
export function playMatchTwins(tileValue: number): void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return;

  // Calculate excitement level based on tile value (3, 6, 12, 24, 48, 96, etc.)
  const level = Math.log2(tileValue / 3) + 1; // 3->1, 6->2, 12->3, 24->4, etc.
  const numNotes = Math.min(Math.floor(level) + 1, 5);

  // Base frequency increases with tile value
  const baseFreq = 330 + (level * 50);

  for (let i = 0; i < numNotes; i++) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = i === 0 ? 'sine' : 'triangle';

    // Create ascending arpeggio
    const noteFreq = baseFreq * Math.pow(1.25, i); // Major third intervals
    const noteTime = ctx.currentTime + (i * 0.08);

    oscillator.frequency.setValueAtTime(noteFreq, noteTime);

    // Volume increases with excitement
    const volume = 0.15 + (level * 0.02);
    gainNode.gain.setValueAtTime(0, noteTime);
    gainNode.gain.linearRampToValueAtTime(volume, noteTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.25);

    oscillator.start(noteTime);
    oscillator.stop(noteTime + 0.3);
  }

  // Add a shimmer effect for high value matches
  if (level >= 3) {
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();

    shimmer.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(baseFreq * 2, ctx.currentTime);
    shimmer.frequency.setValueAtTime(baseFreq * 3, ctx.currentTime + 0.2);

    shimmerGain.gain.setValueAtTime(0.05, ctx.currentTime);
    shimmerGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    shimmer.start(ctx.currentTime);
    shimmer.stop(ctx.currentTime + 0.4);
  }
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
