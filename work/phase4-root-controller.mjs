import fs from 'node:fs';
import path from 'node:path';
const root='C:/Users/garus/OneDrive/Desktop/taskin';
function change(file,before,after){const p=path.join(root,file);const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');if(!s.includes(before))throw new Error('Missing anchor '+file);fs.writeFileSync(p,s.replace(before,after));}
change('apps/api/src/modules/domain.module.ts', "import { Module } from '@nestjs/common';", "import { Module } from '@nestjs/common';\nimport { BroadcastsService } from './broadcasts/broadcasts.service.js';");
change('apps/api/src/modules/domain.module.ts', 'const services = [', 'const services = [\n  BroadcastsService,');
change('apps/api/src/app.module.ts', "import { ChatController }", "import { BroadcastsController } from './modules/broadcasts/broadcasts.controller.js';\nimport { ChatController }");
change('apps/api/src/app.module.ts', 'controllers: [AuthController,', 'controllers: [BroadcastsController, AuthController,');
change('apps/api/src/modules/platform-admin/platform-admin.module.ts', "import { Module } from '@nestjs/common';", "import { Module } from '@nestjs/common';\nimport { PlatformBroadcastsService } from './platform-broadcasts.service.js';\nimport { PlatformHealthService } from './platform-health.service.js';");
change('apps/api/src/modules/platform-admin/platform-admin.module.ts', '  providers: [', '  providers: [\n    PlatformBroadcastsService,\n    PlatformHealthService,');
change('apps/api/src/modules/platform-admin/platform-admin.controller.ts', '  Controller,', '  Controller,\n  Delete,\n  Patch,');
change('apps/api/src/modules/platform-admin/platform-admin.controller.ts', "import { AppConfig }", "import type { SystemBroadcastPage, SystemBroadcastView, PlatformMetrics, PlatformHealth, PlatformOutboxHealth } from '@taskin/contracts';\nimport { BroadcastQueryDto, CreateBroadcastDto, UpdateBroadcastDto, SystemBroadcastPageDto, SystemBroadcastViewDto } from '../broadcasts/broadcasts.dto.js';\nimport { PlatformBroadcastsService } from './platform-broadcasts.service.js';\nimport { PlatformHealthService } from './platform-health.service.js';\nimport { PlatformMetricsDto, PlatformHealthDto, PlatformOutboxHealthDto } from './platform-health.dto.js';\nimport { AppConfig }");
change('apps/api/src/modules/platform-admin/platform-admin.controller.ts', '    private readonly workspaceModeration: PlatformWorkspaceModerationService,', '    private readonly workspaceModeration: PlatformWorkspaceModerationService,\n    private readonly broadcasts: PlatformBroadcastsService,\n    private readonly healthService: PlatformHealthService,');
change('apps/api/src/modules/platform-admin/platform-admin.controller.ts', '  /* ---------------------------------------------------------------- users and sessions */', `  /* ---------------------------------------------------------------- phase 4: platform operations */

  @Get('broadcasts')
  @ApiOperation({ summary: 'Platform broadcasts, including inactive and optionally archived entries' })
  @ApiOkResponse({ type: SystemBroadcastPageDto })
  listBroadcasts(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() query: BroadcastQueryDto): Promise<SystemBroadcastPage> {
    return this.broadcasts.list(admin, query);
  }

  @Post('broadcasts')
  @ApiOperation({ summary: 'Create a platform announcement (audited and delivered through the outbox)' })
  @ApiCreatedResponse({ type: SystemBroadcastViewDto })
  createBroadcast(@CurrentPlatformAdmin() admin: PlatformAdmin, @Body() body: CreateBroadcastDto): Promise<SystemBroadcastView> {
    return this.broadcasts.create(admin, body);
  }

  @Patch('broadcasts/:broadcastId')
  @ApiOperation({ summary: 'Edit or activate a platform announcement' })
  @ApiOkResponse({ type: SystemBroadcastViewDto })
  updateBroadcast(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('broadcastId', ParseUUIDPipe) id: string, @Body() body: UpdateBroadcastDto): Promise<SystemBroadcastView> {
    return this.broadcasts.update(admin, id, body);
  }

  @Delete('broadcasts/:broadcastId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft archive a platform announcement' })
  @ApiNoContentResponse()
  archiveBroadcast(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('broadcastId', ParseUUIDPipe) id: string): Promise<void> {
    return this.broadcasts.archive(admin, id);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Platform counts and storage usage, cached for 60 seconds' })
  @ApiOkResponse({ type: PlatformMetricsDto })
  metrics(@CurrentPlatformAdmin() admin: PlatformAdmin): Promise<PlatformMetrics> {
    return this.healthService.metrics(admin);
  }

  @Get('health')
  @ApiOperation({ summary: 'Parallel readiness probes and passive SMS provider status' })
  @ApiOkResponse({ type: PlatformHealthDto })
  health(@CurrentPlatformAdmin() admin: PlatformAdmin): Promise<PlatformHealth> {
    return this.healthService.health(admin);
  }

  @Get('health/outbox')
  @ApiOperation({ summary: 'Outbox backlog, queue counts and sanitized failure summaries' })
  @ApiOkResponse({ type: PlatformOutboxHealthDto })
  outboxHealth(@CurrentPlatformAdmin() admin: PlatformAdmin): Promise<PlatformOutboxHealth> {
    return this.healthService.outbox(admin);
  }

  /* ---------------------------------------------------------------- users and sessions */`);
fs.appendFileSync(path.join(root,'infra/postgres/platform-admin-role.sql'), `
-- Phase 4: broadcasts and operational bookkeeping, never outbox payloads or headers.
DO $$
BEGIN
  IF to_regclass('public.system_broadcasts') IS NOT NULL THEN
    GRANT SELECT ON system_broadcasts TO taskin_platform_admin;
  END IF;
END
$$;
GRANT SELECT (id, event_type, aggregate_type, workspace_id, created_at, published_at) ON outbox_events TO taskin_platform_admin;
`);
