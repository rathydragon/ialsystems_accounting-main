import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetupGuideModal } from '../../src/components/SetupGuideModal';

describe('SetupGuideModal Component Unit Tests', () => {
  it('should render nothing when isOpen is false', () => {
    const { container } = render(
      <SetupGuideModal
        isOpen={false}
        onClose={vi.fn()}
        onOpenCode={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render title and default tabs when isOpen is true', () => {
    render(
      <SetupGuideModal
        isOpen={true}
        onClose={vi.fn()}
        onOpenCode={vi.fn()}
      />
    );

    expect(screen.getByText('Step-by-Step Architecture Setup Guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. google sheets/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3\. telegram bot/i })).toBeInTheDocument();
  });

  it('should switch tabs when tab buttons are clicked', () => {
    render(
      <SetupGuideModal
        isOpen={true}
        onClose={vi.fn()}
        onOpenCode={vi.fn()}
      />
    );

    const telegramTab = screen.getByRole('button', { name: /3\. telegram bot/i });
    fireEvent.click(telegramTab);

    expect(screen.getByText(/Setup Telegram Bot/i)).toBeInTheDocument();
    expect(screen.getByText(/@BotFather/i)).toBeInTheDocument();
  });

  it('should trigger onOpenCode when view code button is clicked in script tab', () => {
    const handleOpenCode = vi.fn();
    render(
      <SetupGuideModal
        isOpen={true}
        onClose={vi.fn()}
        onOpenCode={handleOpenCode}
      />
    );

    const scriptTab = screen.getByRole('button', { name: /apps script/i });
    fireEvent.click(scriptTab);

    const viewCodeBtn = screen.getByRole('button', { name: /inspect code\.gs & standalone html/i });
    fireEvent.click(viewCodeBtn);

    expect(handleOpenCode).toHaveBeenCalledTimes(1);
  });

  it('should trigger onClose when clicking close button', () => {
    const handleClose = vi.fn();
    render(
      <SetupGuideModal
        isOpen={true}
        onClose={handleClose}
        onOpenCode={vi.fn()}
      />
    );

    const closeBtn = screen.getByText('✕');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
