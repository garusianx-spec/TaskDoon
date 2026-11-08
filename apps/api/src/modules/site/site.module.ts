import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module.js';
import { PlatformAdminGuard, PlatformAdminSmsGuard } from '../platform-admin/platform-admin.guard.js';
import { NoStoreInterceptor } from '../platform-admin/platform-admin.controller.js';
import { AdminSiteController, PublicSiteController } from './site.controller.js';
import { SiteService } from './site.service.js';

@Module({ imports: [DomainModule], controllers: [PublicSiteController, AdminSiteController], providers: [SiteService, PlatformAdminGuard, PlatformAdminSmsGuard, NoStoreInterceptor] })
export class SiteModule {}
