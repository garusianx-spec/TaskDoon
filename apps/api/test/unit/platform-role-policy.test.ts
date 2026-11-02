import { describe, expect, it } from 'vitest';
import { administrativeStatus, isPrimaryOwner, platformRole, PRIMARY_OWNER_PHONE } from '../../src/platform/security/platform-role-policy.js';
describe('platform role boundaries', () => {
  it('never grants access from a phone number or stale role alone', () => {
    expect(platformRole({ phone: PRIMARY_OWNER_PHONE, isPlatformAdmin: false, platformAdminRole: 'SUPER_ADMIN' })).toBeNull();
    expect(platformRole({ phone: '+989121234567', isPlatformAdmin: false, platformAdminRole: 'ADMIN' })).toBeNull();
  });
  it('resolves the explicitly flagged owner and preserves legacy ADMIN grants', () => {
    expect(platformRole({ phone: PRIMARY_OWNER_PHONE, isPlatformAdmin: true })).toBe('SUPER_ADMIN');
    expect(platformRole({ phone: '+989121234567', isPlatformAdmin: true })).toBe('ADMIN');
    expect(platformRole({ phone: '+989121234567', isPlatformAdmin: true, platformAdminRole: 'OPERATOR' })).toBe('OPERATOR');
    expect(isPrimaryOwner(PRIMARY_OWNER_PHONE)).toBe(true);
    expect(isPrimaryOwner('+989121234567')).toBe(false);
  });
  it('reports suspension without confusing pending setup with an active grant', () => {
    expect(administrativeStatus({ status: 'active', platformAdminStatus: 'PENDING_SETUP' })).toBe('PENDING_SETUP');
    expect(administrativeStatus({ status: 'suspended', platformAdminStatus: 'ACTIVE' })).toBe('SUSPENDED');
  });
});
