/**
 * Theme Manager - Handle dark/light mode switching
 * Uses CSS variables for dynamic theming
 */

export const THEMES = {
  dark: {
    name: 'Dark',
    colors: {
      background: '#0a0b0d',
      surface: '#1f2937',
      surfaceSecondary: '#111827',
      border: '#374151',
      borderLight: '#4b5563',
      text: '#f9fafb',
      textSecondary: '#d1d5db',
      textMuted: '#9ca3af',
      textDim: '#6b7280',
      accent: '#2563eb',
      success: '#10b981',
      successDark: '#059669',
      danger: '#ef4444',
      warning: '#f59e0b',
      info: '#06b6d4',
      purple: '#8b5cf6',
      green: '#22c55e',
      red: '#ef4444',
      amber: '#f59e0b',
      cyan: '#06b6d4',
    }
  },
  light: {
    name: 'Light',
    colors: {
      background: '#f8fafc',
      surface: '#ffffff',
      surfaceSecondary: '#f1f5f9',
      border: '#e2e8f0',
      borderLight: '#cbd5e1',
      text: '#1e293b',
      textSecondary: '#475569',
      textMuted: '#64748b',
      textDim: '#94a3b8',
      accent: '#3b82f6',
      success: '#059669',
      successDark: '#047857',
      danger: '#dc2626',
      warning: '#d97706',
      info: '#0891b2',
      purple: '#7c3aed',
      green: '#16a34a',
      red: '#dc2626',
      amber: '#d97706',
      cyan: '#0891b2',
    }
  }
};

export class ThemeManager {
  constructor() {
    this.currentTheme = 'dark';
    this.listeners = new Set();
    
    // Load saved theme preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('scalper-theme');
      if (saved && THEMES[saved]) {
        this.currentTheme = saved;
      } else {
        // Auto-detect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentTheme = prefersDark ? 'dark' : 'light';
      }
      
      // Apply theme immediately
      this.applyTheme(this.currentTheme);
      
      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't manually set a preference
        if (!localStorage.getItem('scalper-theme')) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  /**
   * Apply theme colors to CSS variables
   */
  applyTheme(themeName) {
    if (typeof window === 'undefined' || !THEMES[themeName]) return;
    
    const theme = THEMES[themeName];
    const root = document.documentElement;
    
    // Apply CSS custom properties
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
    });
    
    // Add theme class to body
    document.body.className = document.body.className
      .replace(/theme-\w+/g, '')
      .trim();
    document.body.classList.add(`theme-${themeName}`);
  }

  /**
   * Set theme and save preference
   */
  setTheme(themeName) {
    if (!THEMES[themeName]) {
      console.warn(`Theme "${themeName}" not found`);
      return;
    }
    
    this.currentTheme = themeName;
    this.applyTheme(themeName);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('scalper-theme', themeName);
    }
    
    // Notify listeners
    this.listeners.forEach(callback => {
      try {
        callback(themeName);
      } catch (error) {
        console.error('Theme listener error:', error);
      }
    });
  }

  /**
   * Toggle between dark and light themes
   */
  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * Get current theme
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get theme object
   */
  getTheme(themeName = null) {
    return THEMES[themeName || this.currentTheme];
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get a color value from current theme
   */
  getColor(colorName) {
    return this.getTheme().colors[colorName];
  }

  /**
   * Check if current theme is dark
   */
  isDark() {
    return this.currentTheme === 'dark';
  }

  /**
   * Check if current theme is light
   */
  isLight() {
    return this.currentTheme === 'light';
  }
}

// Singleton instance
export const themeManager = new ThemeManager();

export default themeManager;