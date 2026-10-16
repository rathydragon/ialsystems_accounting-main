import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelegramPreviewModal } from '../../src/components/TelegramPreviewModal';
import { Transaction } from '../../src/types';

describe('TelegramPreviewModal Component Unit Tests', () => {
  const mockTransaction: Transaction = {
    id: 'tx-test-123',
    type: 'INCOME',
    category: 'Express Delivery COD',
    amount: 25.50,
    currency: 'USD',
    date: '2026-10-16',
    note: 'Collected from customer',
    timestamp: '2026-10-16 14:00:00'
  };

  it('should render nothing when isOpen is false', () => {
    const { container } = render(
      <TelegramPreviewModal
        isOpen={false}
        onClose={vi.fn()}
        latestTransaction={mockTransaction}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render modal with header, transaction details, and badge when open', () => {
    render(
      <TelegramPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        latestTransaction={mockTransaction}
        telegramChatId="-100998877"
      />
    );

    expect(screen.getByText('Telegram Bot Alert Preview')).toBeInTheDocument();
    expect(screen.getByText('🟢 NEW INCOME')).toBeInTheDocument();
    expect(screen.getByText('Express Delivery COD')).toBeInTheDocument();
    expect(screen.getByText(/Collected from customer/)).toBeInTheDocument();
    expect(screen.getByText('-100998877')).toBeInTheDocument();
  });

  it('should trigger onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <TelegramPreviewModal
        isOpen={true}
        onClose={handleClose}
        latestTransaction={mockTransaction}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('should display test alert success feedback when Send Test Alert button is clicked', () => {
    render(
      <TelegramPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        latestTransaction={mockTransaction}
      />
    );

    const sendTestBtn = screen.getByRole('button', { name: /simulate alert/i });
    fireEvent.click(sendTestBtn);

    expect(screen.getByText(/sent preview!/i)).toBeInTheDocument();
  });
});
