import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module.js';
import { PlatformAdminModule } from '../platform-admin/platform-admin.module.js';
import { AdminSupportController, SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';
/** HTTP-only feature: shares the existing admin guard, audit writer and read-only pool. */
@Module({
  imports: [DomainModule, PlatformAdminModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
