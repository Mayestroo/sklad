import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSwitcher } from './ThemeSwitcher';

const button = () => screen.getByRole('button');

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  it('restores the saved dark theme', () => {
    localStorage.setItem('crm_theme', 'dark');
    render(<ThemeSwitcher />);
    expect(button().getAttribute('title')).toContain('Light mode');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('starts light without a saved theme', () => {
    render(<ThemeSwitcher />);
    expect(button().getAttribute('title')).toContain('Dark mode');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles, saves the choice and updates every switcher', () => {
    render(<><ThemeSwitcher /><ThemeSwitcher /></>);
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(localStorage.getItem('crm_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('title')).toContain('Light mode');
  });
});
