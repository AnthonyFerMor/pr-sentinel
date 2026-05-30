'use client';

import { useEffect, useState } from 'react';

/**
 * ThemeToggle — switches between dark (default) and light themes.
 *
 * The theme is a `dark` / `light` class on <html>, set before paint by an
 * inline script in the root layout (no flash). This button reads the current
 * class on mount, then toggles + persists to localStorage on click.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore (private mode / disabled storage) */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-gray-400 hover:text-white hover:bg-white/5 transition"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch. */}
      {mounted && theme === 'light' ? (
        // Moon — click to go dark
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ) : (
        // Sun — click to go light
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )}
    </button>
  );
}
