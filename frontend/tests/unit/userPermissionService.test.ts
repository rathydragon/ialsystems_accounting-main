import { describe, it, expect } from 'vitest';
import {
  canUserAccessPage,
  isMasterAdmin,
  getDefaultAllowedPages,
  MASTER_ADMIN_EMAIL,
  IAL_ACCOUNTING_EMAIL
} from '../../src/services/userPermissionService';
import { AuthUser, UserPermission, normalizeUserRole } from '../../src/types';

describe('userPermissionService & Access Control Logic', () => {
  it('should identify Master Admin emails correctly', () => {
    expect(isMasterAdmin(MASTER_ADMIN_EMAIL)).toBe(true);
    expect(isMasterAdmin('regular.staff@ial.com')).toBe(false);
    expect(isMasterAdmin(null)).toBe(false);
  });

  it('should normalize user roles uniformly', () => {
    expect(normalizeUserRole('delivery')).toBe('DELIVERY');
    expect(normalizeUserRole('HUB (OPT)')).toBe('HUB_OPT');
    expect(normalizeUserRole('cs teams')).toBe('CS_TEAMS');
    expect(normalizeUserRole(undefined)).toBe('VIEWER');
  });

  it('should provide role-specific default allowed pages', () => {
    const deliveryPages = getDefaultAllowedPages('DELIVERY');
    expect(deliveryPages).toContain('BANK_SLIPS');
    expect(deliveryPages).toContain('OUT_OF_DELIVERY');
    expect(deliveryPages).not.toContain('PERMISSIONS');

    const hubPages = getDefaultAllowedPages('HUB');
    expect(hubPages).toContain('SCAN_IN');
    expect(hubPages).toContain('SCAN_OUT');
    expect(hubPages).not.toContain('PERMISSIONS');
  });

  it('should grant Master Admin access to all pages unconditionally', () => {
    const masterUser: AuthUser = {
      email: MASTER_ADMIN_EMAIL,
      name: 'Master Admin',
      role: 'ADMIN'
    };
    expect(canUserAccessPage('PERMISSIONS', masterUser)).toBe(true);
    expect(canUserAccessPage('SETTINGS', masterUser)).toBe(true);
    expect(canUserAccessPage('COLLECTION', masterUser)).toBe(true);
  });

  it('should restrict PERMISSIONS and SETTINGS strictly to ADMIN role', () => {
    const riderUser: AuthUser = {
      email: 'rider01@ial.com',
      name: 'Rider 01',
      role: 'USER',
      allowedPages: ['OUT_OF_DELIVERY']
    };
    expect(canUserAccessPage('PERMISSIONS', riderUser)).toBe(false);
    expect(canUserAccessPage('SETTINGS', riderUser)).toBe(false);
    expect(canUserAccessPage('OUT_OF_DELIVERY', riderUser)).toBe(true);
  });

  it('should respect custom allowedPages defined in UserPermission record', () => {
    const user: AuthUser = {
      email: 'custom.clerk@ial.com',
      name: 'Clerk',
      role: 'USER'
    };

    const permissions: UserPermission[] = [
      {
        email: 'custom.clerk@ial.com',
        name: 'Clerk',
        role: 'USER',
        status: 'ACTIVE',
        allowedPages: ['COLLECTION', 'DATA_REPORT']
      }
    ];

    expect(canUserAccessPage('COLLECTION', user, permissions)).toBe(true);
    expect(canUserAccessPage('DATA_REPORT', user, permissions)).toBe(true);
    expect(canUserAccessPage('BANK_SLIPS', user, permissions)).toBe(false);
  });

  it('should deny access if user is null or undefined', () => {
    expect(canUserAccessPage('COLLECTION', null)).toBe(false);
    expect(canUserAccessPage('COLLECTION', undefined)).toBe(false);
  });
});
