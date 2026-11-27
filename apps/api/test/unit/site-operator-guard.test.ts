import { describe, expect, it } from 'vitest';
import type { PlatformAdmin } from '../../src/modules/platform-admin/platform-admin.guard.js';
import { assertCanModifySite } from '../../src/modules/site/site.service.js';

describe('CMS operator access guard', () => {
  const operator: PlatformAdmin = {
    userId: 'user-op',
    fullName: 'Operator User',
    role: 'OPERATOR',
  };

  const admin: PlatformAdmin = {
    userId: 'user-admin',
    fullName: 'Admin User',
    role: 'ADMIN',
  };

  const superAdmin: PlatformAdmin = {
    userId: 'user-super',
    fullName: 'Super Admin User',
    role: 'SUPER_ADMIN',
  };

  it('rejects OPERATOR from mutating CMS documents, media, or redirects', () => {
    expect(() => assertCanModifySite(operator)).toThrowError(
      'Higher platform administrative privileges are required.',
    );
  });

  it('allows ADMIN and SUPER_ADMIN to mutate CMS resources', () => {
    expect(() => assertCanModifySite(admin)).not.toThrow();
    expect(() => assertCanModifySite(superAdmin)).not.toThrow();
  });
});
