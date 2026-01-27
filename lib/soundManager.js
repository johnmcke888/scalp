/**
 * Sound Manager - Web Audio API integration for trade alerts
 * Plays audio cues for wins/losses without requiring external files
 */

class SoundManager {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
    this.volume = 0.3;
    
    // Track last played sounds to avoid spam
    this.lastWinSound = 0;
    this.lastLossSound = 0;
    this.cooldownMs = 1000; // 1 second cooldown between sounds
  }

  // Initialize audio context (requires user interaction)
  async init() {
    if (this.audioContext) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error) {
      console.warn('Audio context not available:', error);
      this.enabled = false;
    }
  }

  // Generate a frequency tone
  generateTone(frequency, duration = 0.2, type = 'sine') {
    if (!this.audioContext || !this.enabled) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;

    // Create envelope (fade in/out)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Play win sound - ascending chime
  playWin() {
    const now = Date.now();
    if (now - this.lastWinSound < this.cooldownMs) return;
    this.lastWinSound = now;

    if (!this.audioContext || !this.enabled) return;

    // Three ascending tones: C5 -> E5 -> G5
    setTimeout(() => this.generateTone(523.25, 0.15), 0);
    setTimeout(() => this.generateTone(659.25, 0.15), 100);
    setTimeout(() => this.generateTone(783.99, 0.25), 200);
  }

  // Play loss sound - descending tone
  playLoss() {
    const now = Date.now();
    if (now - this.lastLossSound < this.cooldownMs) return;
    this.lastLossSound = now;

    if (!this.audioContext || !this.enabled) return;

    // Descending tone: D4 -> A3
    setTimeout(() => this.generateTone(293.66, 0.2, 'square'), 0);
    setTimeout(() => this.generateTone(220.00, 0.3, 'square'), 150);
  }

  // Play neutral notification sound
  playNotification() {
    if (!this.audioContext || !this.enabled) return;
    this.generateTone(440, 0.1); // A4 note
  }

  // Enable/disable sounds
  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('scalper-sounds-enabled', enabled.toString());
  }

  // Set volume (0-1)
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('scalper-sounds-volume', this.volume.toString());
  }

  // Load settings from localStorage
  loadSettings() {
    const savedEnabled = localStorage.getItem('scalper-sounds-enabled');
    const savedVolume = localStorage.getItem('scalper-sounds-volume');
    
    if (savedEnabled !== null) {
      this.enabled = savedEnabled === 'true';
    }
    
    if (savedVolume !== null) {
      this.volume = parseFloat(savedVolume) || 0.3;
    }
  }
}

// Singleton instance
export const soundManager = new SoundManager();

// Auto-load settings
if (typeof window !== 'undefined') {
  soundManager.loadSettings();
}

export default soundManager;