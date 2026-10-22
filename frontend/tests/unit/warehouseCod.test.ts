import { describe, it, expect } from 'vitest';
import { formCodAmount, codTotalsText } from '../../src/components/WarehouseManagementPage';

describe('Warehouse COD amounts', () => {
  it('keeps normal dollar and riel amounts as typed', () => {
    expect(formCodAmount('2.50', 'USD')).toEqual({ codAmount: 2.5, currency: 'USD' });
    expect(formCodAmount('8000', 'KHR')).toEqual({ codAmount: 8000, currency: 'KHR' });
    expect(formCodAmount('', 'USD')).toEqual({ codAmount: undefined, currency: 'USD' });
  });

  it('saves a large round amount typed with "$" as riel', () => {
    expect(formCodAmount('10000', 'USD')).toEqual({ codAmount: 10000, currency: 'KHR' });
    expect(formCodAmount('10,000', 'USD')).toEqual({ codAmount: 10000, currency: 'KHR' });
    expect(formCodAmount('650.50', 'USD')).toEqual({ codAmount: 650.5, currency: 'USD' });
  });

  it('totals dollars and riel separately', () => {
    const items = [
      { codAmount: 2, currency: 'USD' },
      { codAmount: 10000, currency: 'KHR' },
      { codAmount: 10000, currency: 'KHR' },
      { codAmount: 0, currency: 'USD' },
      { codAmount: 3.5 }
    ];
    expect(codTotalsText(items)).toBe('$5.50 · 20,000 ៛');
    expect(codTotalsText([])).toBe('');
  });
});
