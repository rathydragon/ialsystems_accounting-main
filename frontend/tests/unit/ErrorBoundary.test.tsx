import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

// Helper component that throws an error when trigger is true
const ProblemChild: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Simulated UI rendering crash');
  }
  return <div>Normal Content Loaded</div>;
};

describe('ErrorBoundary Component Unit Tests', () => {
  // Prevent noisy console.error during expected throw tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Normal Content Loaded</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content Loaded')).toBeInTheDocument();
  });

  it('should catch error and render fallback error UI when a child crashes', () => {
    render(
      <ErrorBoundary fallbackTitle="Custom Error View">
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error View')).toBeInTheDocument();
    expect(screen.getByText('Simulated UI rendering crash')).toBeInTheDocument();
  });

  it('should trigger onReset callback when clicking retry button', () => {
    const handleReset = vi.fn();
    render(
      <ErrorBoundary onReset={handleReset}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const retryBtn = screen.getByRole('button', { name: /ផ្ទុកឡើងវិញ/i });
    fireEvent.click(retryBtn);

    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
