import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '../../src/components/Navbar';
import { AppSettings, AuthUser } from '../../src/types';

describe('Navbar Component Unit Tests', () => {
  const mockSettings: AppSettings = {
    webAppUrl: 'https://script.google.com/macros/s/test/exec',
    telegramBotToken: '',
    telegramChatId: '-100123456789',
    autoSync: false,
    syncInterval: 5,
    darkMode: false,
    currency: 'USD',
    exchangeRate: 4100
  };

  const mockAdminUser: AuthUser = {
    email: 'admin@ialsystems.com',
    name: 'Admin Tester',
    role: 'ADMIN'
  };

  it('should render brand logo, title, and connected status badge', () => {
    render(
      <Navbar
        settings={mockSettings}
        user={mockAdminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
      />
    );

    expect(screen.getByText('IAL SYSTEMS')).toBeInTheDocument();
    expect(screen.getByText('Google Sync Active')).toBeInTheDocument();
  });

  it('should show Demo / Local Mode badge when webAppUrl is empty', () => {
    const disconnectedSettings = { ...mockSettings, webAppUrl: '' };
    render(
      <Navbar
        settings={disconnectedSettings}
        user={mockAdminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
      />
    );

    expect(screen.getByText('Demo / Local Mode')).toBeInTheDocument();
  });

  it('should trigger onToggleTheme callback when theme toggle button is clicked', () => {
    const handleToggleTheme = vi.fn();
    render(
      <Navbar
        settings={mockSettings}
        user={mockAdminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={handleToggleTheme}
      />
    );

    const themeButton = screen.getByTitle(/Dark Mode/i);
    fireEvent.click(themeButton);
    expect(handleToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('should trigger onOpenSettings and onOpenTelegramPreview callbacks', () => {
    const handleOpenSettings = vi.fn();
    const handleOpenTelegram = vi.fn();

    render(
      <Navbar
        settings={mockSettings}
        user={mockAdminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={handleOpenSettings}
        onOpenTelegramPreview={handleOpenTelegram}
        onToggleTheme={vi.fn()}
      />
    );

    const settingsButton = screen.getByTitle(/API & Connection Settings/i);
    fireEvent.click(settingsButton);
    expect(handleOpenSettings).toHaveBeenCalledTimes(1);

    const telegramButton = screen.getByTitle(/Preview Telegram Bot Message/i);
    fireEvent.click(telegramButton);
    expect(handleOpenTelegram).toHaveBeenCalledTimes(1);
  });

  it('should render logout button and fire onLogout callback', () => {
    const handleLogout = vi.fn();
    render(
      <Navbar
        settings={mockSettings}
        user={mockAdminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onLogout={handleLogout}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
      />
    );

    const logoutBtn = screen.getByTitle(/Sign Out/i);
    fireEvent.click(logoutBtn);
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});
