import { describe, expect, it } from 'vitest';
import { PlatformAdminController } from '../../src/modules/platform-admin/platform-admin.controller.js';
import {
  administrativeStatus,
  isPrimaryOwner,
  isProtectedAdminTarget,
  platformRole,
  PRIMARY_OWNER_PHONE,
} from '../../src/platform/security/platform-role-policy.js';
describe('platform role boundaries', () => {
  it('never grants access from a phone number or stale role alone', () => {
    expect(
      platformRole({ phone: PRIMARY_OWNER_PHONE, isPlatformAdmin: false, platformAdminRole: 'SUPER_ADMIN' }),
    ).toBeNull();
    expect(
      platformRole({ phone: '+989121234567', isPlatformAdmin: false, platformAdminRole: 'ADMIN' }),
    ).toBeNull();
  });
  it('resolves the explicitly flagged owner and preserves legacy ADMIN grants', () => {
    expect(platformRole({ phone: PRIMARY_OWNER_PHONE, isPlatformAdmin: true })).toBe('SUPER_ADMIN');
    expect(platformRole({ phone: '+989121234567', isPlatformAdmin: true })).toBe('ADMIN');
    expect(
      platformRole({ phone: '+989121234567', isPlatformAdmin: true, platformAdminRole: 'OPERATOR' }),
    ).toBe('OPERATOR');
    expect(isPrimaryOwner(PRIMARY_OWNER_PHONE)).toBe(true);
    expect(isPrimaryOwner('+989121234567')).toBe(false);
  });
  it('protects both the primary owner and any platform administrator from peer actions', () => {
    expect(isProtectedAdminTarget({ phone: PRIMARY_OWNER_PHONE, isPlatformAdmin: false })).toBe(true);
    expect(isProtectedAdminTarget({ phone: '+989121234567', isPlatformAdmin: true })).toBe(true);
    expect(isProtectedAdminTarget({ phone: '+989121234567', isPlatformAdmin: false })).toBe(false);
  });
  it('restricts sensitive platform admin mutations away from OPERATOR while keeping read endpoints open', () => {
    const mutationMethods: (keyof PlatformAdminController)[] = [
      'createBroadcast',
      'updateBroadcast',
      'archiveBroadcast',
      'revokeSession',
      'revokeAll',
      'issuePasswordReset',
      'suspend',
      'unsuspend',
      'setPasswordResetRequired',
      'suspendWorkspace',
      'unsuspendWorkspace',
      'transferWorkspaceOwnership',
      'setWorkspaceLimits',
    ];
    for (const method of mutationMethods) {
      const roles = Reflect.getMetadata('platform.requiredRole', PlatformAdminController.prototype[method]);
      expect(roles, String(method)).toEqual(['SUPER_ADMIN', 'ADMIN']);
    }
    const readMethods: (keyof PlatformAdminController)[] = [
      'listBroadcasts',
      'metrics',
      'health',
      'listUsers',
      'user',
      'sessions',
      'listWorkspaces',
      'workspace',
      'audit',
    ];
    for (const method of readMethods) {
      const roles = Reflect.getMetadata('platform.requiredRole', PlatformAdminController.prototype[method]);
      expect(roles, String(method)).toBeUndefined();
    }
  });
  it('reports suspension without confusing pending setup with an active grant', () => {
    expect(administrativeStatus({ status: 'active', platformAdminStatus: 'PENDING_SETUP' })).toBe(
      'PENDING_SETUP',
    );
    expect(administrativeStatus({ status: 'suspended', platformAdminStatus: 'ACTIVE' })).toBe('SUSPENDED');
  });
});
