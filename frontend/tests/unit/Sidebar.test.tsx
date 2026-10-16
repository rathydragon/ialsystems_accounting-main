import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/components/Sidebar';
import { AppSettings, AuthUser, NavView } from '../../src/types';

describe('Sidebar Component & Protected Routes Navigation Unit Tests', () => {
  const mockSettings: AppSettings = {
    webAppUrl: 'https://script.google.com/macros/s/test/exec',
    telegramBotToken: '',
    telegramChatId: '',
    autoSync: false,
    syncInterval: 5,
    darkMode: false,
    currency: 'USD',
    exchangeRate: 4100
  };

  const adminUser: AuthUser = {
    email: 'admin@ialsystems.com',
    name: 'Administrator',
    role: 'ADMIN'
  };

  const riderUser: AuthUser = {
    email: 'rider@ialsystems.com',
    name: 'Delivery Rider',
    role: 'DELIVERY',
    allowedPages: ['OUT_OF_DELIVERY', 'DISTRIBUTION_REPORT', 'BANK_SLIPS']
  };

  it('should render application name and brand identity', () => {
    render(
      <Sidebar
        settings={mockSettings}
        user={adminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getAllByText('IAL SYSTEMS').length).toBeGreaterThan(0);
  });

  it('should show User Management (PERMISSIONS) for ADMIN user', () => {
    render(
      <Sidebar
        settings={mockSettings}
        user={adminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    // Expand System accordion group
    const systemGroup = screen.getByTitle(/System & Admin/i);
    fireEvent.click(systemGroup);

    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  it('should NOT render User Permissions for DELIVERY user (permission boundary)', () => {
    render(
      <Sidebar
        settings={mockSettings}
        user={riderUser}
        currentView="OUT_OF_DELIVERY"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.queryByText(/User Permissions/i)).not.toBeInTheDocument();
  });

  it('should trigger onNavigate when clicking on an allowed navigation page', () => {
    const handleNavigate = vi.fn();
    render(
      <Sidebar
        settings={mockSettings}
        user={riderUser}
        currentView="OUT_OF_DELIVERY"
        onNavigate={handleNavigate}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
      />
    );

    // Click on Accounting Accordion Header to expand it
    const accountingGroup = screen.getByTitle(/Finance & Accounting/i);
    fireEvent.click(accountingGroup);

    // Click on Bank Slips tab
    const bankSlipsBtn = screen.getByText(/Bank Slips/i);
    fireEvent.click(bankSlipsBtn);

    expect(handleNavigate).toHaveBeenCalledWith('BANK_SLIPS');
  });

  it('should toggle collapse state when collapse button is clicked', () => {
    const handleToggleCollapse = vi.fn();
    render(
      <Sidebar
        settings={mockSettings}
        user={adminUser}
        currentView="COLLECTION"
        onNavigate={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTelegramPreview={vi.fn()}
        onToggleTheme={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={handleToggleCollapse}
      />
    );

    const collapseBtn = screen.getByTitle('Collapse Sidebar');
    fireEvent.click(collapseBtn);
    expect(handleToggleCollapse).toHaveBeenCalledTimes(1);
  });
});
