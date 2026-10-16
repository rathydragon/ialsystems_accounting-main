import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginView } from '../../src/components/LoginView';
import { AppSettings, UserPermission } from '../../src/types';

describe('LoginView Integration Tests (Form Validation & Mock API)', () => {
  const mockSettings: AppSettings = {
    webAppUrl: 'https://script.google.com/macros/s/test/exec',
    googleClientId: 'mock-google-client-id.apps.googleusercontent.com',
    telegramBotToken: '',
    telegramChatId: '',
    autoSync: false,
    syncInterval: 5,
    darkMode: false,
    currency: 'USD',
    exchangeRate: 4100
  };

  const mockPermissions: UserPermission[] = [
    {
      id: 'perm-1',
      email: 'staff@ialsystems.com',
      name: 'Staff Member',
      role: 'USER',
      status: 'ACTIVE',
      allowedPages: ['COLLECTION']
    }
  ];

  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (typeof url === 'string' && url.includes('/api/permissions')) {
        if (options && options.method === 'POST') {
          const body = JSON.parse(options.body || '{}');
          if (body.action === 'login') {
            if (body.password === 'CorrectPass123') {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                  status: 'success',
                  token: 'mock.jwt.token.xyz',
                  user: {
                    id: 'user-001',
                    name: 'Staff Member',
                    email: body.email,
                    role: 'USER'
                  }
                })
              });
            } else {
              return Promise.resolve({
                ok: false,
                status: 401,
                json: async () => ({
                  status: 'error',
                  message: 'ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!'
                })
              });
            }
          }
        }
        // Default GET /api/permissions
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            data: mockPermissions
          })
        });
      }
      return Promise.reject(new Error('Unknown URL: ' + url));
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should render Login card with Email & Password tab by default', () => {
    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={vi.fn()}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: /ចូលប្រើប្រព័ន្ធ \(Sign In\)/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ឧ. rathykim34@gmail.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('បញ្ចូលពាក្យសម្ងាត់')).toBeInTheDocument();
  });

  it('should switch between Email/Password and Google tabs', () => {
    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={vi.fn()}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    const googleTab = screen.getByRole('button', { name: /google account/i });
    fireEvent.click(googleTab);

    expect(screen.getByText(/កំពុងភ្ជាប់ជាមួយ Google/i)).toBeInTheDocument();

    const passwordTab = screen.getByRole('button', { name: /email & password/i });
    fireEvent.click(passwordTab);

    expect(screen.getByPlaceholderText('ឧ. rathykim34@gmail.com')).toBeInTheDocument();
  });

  it('should display error when API rejects invalid credentials', async () => {
    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={vi.fn()}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    const emailInput = screen.getByPlaceholderText('ឧ. rathykim34@gmail.com');
    const passwordInput = screen.getByPlaceholderText('បញ្ចូលពាក្យសម្ងាត់');
    const submitBtn = screen.getByRole('button', { name: /ចូលប្រើប្រព័ន្ធ/i });

    fireEvent.change(emailInput, { target: { value: 'staff@ialsystems.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!')).toBeInTheDocument();
    });
  });

  it('should call onLoginSuccess and save JWT token when credentials are valid', async () => {
    const handleLoginSuccess = vi.fn();

    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={handleLoginSuccess}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    const emailInput = screen.getByPlaceholderText('ឧ. rathykim34@gmail.com');
    const passwordInput = screen.getByPlaceholderText('បញ្ចូលពាក្យសម្ងាត់');
    const submitBtn = screen.getByRole('button', { name: /ចូលប្រើប្រព័ន្ធ/i });

    fireEvent.change(emailInput, { target: { value: 'staff@ialsystems.com' } });
    fireEvent.change(passwordInput, { target: { value: 'CorrectPass123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleLoginSuccess).toHaveBeenCalledTimes(1);
      expect(handleLoginSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'staff@ialsystems.com',
          role: 'USER'
        })
      );
      expect(localStorage.getItem('accounting_jwt_token')).toBe('mock.jwt.token.xyz');
    });
  });

  it('should fill email automatically when clicking quick user select chip', () => {
    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={vi.fn()}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    const quickChip = screen.getByText('Staff Member');
    fireEvent.click(quickChip);

    const emailInput = screen.getByPlaceholderText('ឧ. rathykim34@gmail.com') as HTMLInputElement;
    expect(emailInput.value).toBe('staff@ialsystems.com');
  });

  it('should toggle password visibility when clicking eye icon', () => {
    render(
      <LoginView
        settings={mockSettings}
        permissions={mockPermissions}
        onUpdateSettings={vi.fn()}
        onLoginSuccess={vi.fn()}
        darkMode={false}
        onToggleDarkMode={vi.fn()}
      />
    );

    const passwordInput = screen.getByPlaceholderText('បញ្ចូលពាក្យសម្ងាត់') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByTitle('Show password');
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe('text');

    const hideBtn = screen.getByTitle('Hide password');
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe('password');
  });
});
