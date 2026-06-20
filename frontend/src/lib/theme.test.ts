// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTheme, setTheme, toggleTheme } from './theme';

describe('Theme utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = '';
  });

  it('gets default theme if nothing is in local storage', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    expect(getTheme()).toBe('light');
  });

  it('sets the theme and stores it in localStorage', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('zg-theme')).toBe('dark');
  });

  it('toggles the theme', () => {
    setTheme('light');
    const nextTheme = toggleTheme();
    expect(nextTheme).toBe('dark');
    expect(localStorage.getItem('zg-theme')).toBe('dark');
  });
});
