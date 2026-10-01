import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module.js';
import { PlatformAdminDatabase } from './admin-database.js';
import { PlatformAdminUnitOfWork } from './admin-unit-of-work.js';
import { PasswordResetService } from './password-reset.service.js';
import { NoStoreInterceptor, PasswordResetController, PlatformAdminController, PlatformAdminProbeController } from './platform-admin.controller.js';
import { PlatformAdminGuard, PlatformAdminSmsGuard } from './platform-admin.guard.js';
import { PlatformAuditWriter } from './platform-audit.writer.js';
import { PlatformConversationsService } from './platform-conversations.service.js';
import { PlatformModerationService } from './platform-moderation.service.js';
import { PlatformUsersService } from './platform-users.service.js';
import { PlatformWorkspacesService } from './platform-workspaces.service.js';

/**
 * Platform super admin (phase 1), kept apart from the domain: its own read-only database pool and
 * unit of work, guard, audit log and routes under `/admin`. Only the HTTP role loads it, behind
 * the same global guards as every other route; nothing else in the API depends on it.
 */
@Module({
  imports: [DomainModule],
  controllers: [PlatformAdminProbeController, PlatformAdminController, PasswordResetController],
  providers: [
    PlatformAdminDatabase,
    PlatformAdminUnitOfWork,
    PlatformAdminGuard,
    PlatformAdminSmsGuard,
    PlatformAuditWriter,
    PlatformUsersService,
    PlatformConversationsService,
    PlatformWorkspacesService,
    PlatformModerationService,
    PasswordResetService,
    NoStoreInterceptor,
  ],
})
export class PlatformAdminModule {}
