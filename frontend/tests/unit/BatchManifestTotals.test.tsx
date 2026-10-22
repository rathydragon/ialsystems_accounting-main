import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BatchManifestModal, ManifestItem } from '../../src/components/BatchManifestModal';

const items: ManifestItem[] = [
  { id: '1', barcode: 'A1', payment: 'AC' },
  { id: '2', barcode: 'A2', payment: 'CASH', amountKhr: 8000 },
  { id: '3', barcode: 'A3', payment: 'CASH', amountUsd: 2 },
  { id: '4', barcode: 'A4', payment: 'COLLECT', amountKhr: 12000 },
  { id: '5', barcode: 'A5', payment: 'AC', codUsd: 153.21, codKhr: 621400 }
];

describe('Batch Manifest totals by payment type', () => {
  it('shows CASH, COLLECT and COD totals with parcel counts', () => {
    render(<BatchManifestModal isOpen onClose={() => {}} items={items} scanType="OUT_OF_DELIVERY" operationCode="OP-X" />);
    const foot = document.querySelector('tfoot') as HTMLElement;
    const rows = within(foot).getAllByRole('row').map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('សរុបទឹកប្រាក់ (Total)');
    expect(rows).toContain('CASH(2 កញ្ចប់)$2.00 · 8,000 ៛');
    expect(rows).toContain('COLLECT(1 កញ្ចប់)12,000 ៛');
    expect(rows).toContain('COD(1 កញ្ចប់)$153.21 · 621,400 ៛');
    // AC has no USD / KHM amount, so it gets no line of its own
    expect(rows.some((r) => r?.startsWith('AC'))).toBe(false);
    expect(screen.getAllByText('OP-X').length).toBeGreaterThan(0);
  });

  it('CASH and COLLECT lines are always shown, with — when empty', () => {
    render(<BatchManifestModal isOpen onClose={() => {}} items={[items[4]]} scanType="OUT_OF_DELIVERY" />);
    const foot = document.querySelector('tfoot') as HTMLElement;
    const rows = within(foot).getAllByRole('row').map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows).toContain('CASH(0 កញ្ចប់)—');
    expect(rows).toContain('COLLECT(0 កញ្ចប់)—');
  });
});
