'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'crm_theme';

// The saved theme is an external store: every switcher on the page (header,
// design-system page) reads the same value and re-renders when it changes,
// also when another tab changes it.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable: the theme still applies for this visit
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function ThemeSwitcher() {
  // Server render and hydration use light; the saved theme follows at once.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => saveTheme(theme === 'light' ? 'dark' : 'light');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'light' ? "Tungi rejimga o'tish (Dark mode)" : "Kungi rejimga o'tish (Light mode)"}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} style={{ color: '#f59e0b' }} />}
    </button>
  );
}
