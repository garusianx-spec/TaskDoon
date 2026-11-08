import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../platform/http/public.js';
import { RequireCsrf } from '../auth/guards.js';
import { NoStoreInterceptor } from '../platform-admin/platform-admin.controller.js';
import { CurrentPlatformAdmin, type PlatformAdmin, PlatformAdminOnly } from '../platform-admin/platform-admin.guard.js';
import { adminSiteDocumentSchema, publicSiteDocumentSchema, siteDocumentInputSchema, siteSubmissionSchema } from './site.openapi.js';
import { SiteService } from './site.service.js';

@ApiTags('public-site')
@Public()
@Controller('public/site')
@UseInterceptors(NoStoreInterceptor)
export class PublicSiteController {
  constructor(private readonly site: SiteService) {}
  @Get('documents') @ApiOkResponse({ schema: { type: 'array', items: publicSiteDocumentSchema } }) documents(@Query('kind') kind?: string) { return this.site.publicDocuments(kind); }
  @Get('documents/:kind/:slug') @ApiOkResponse({ schema: publicSiteDocumentSchema }) document(@Param('kind') kind: string, @Param('slug') slug: string) { return this.site.publicDocument(kind, slug); }
  @Get('pages/:slug') @ApiOkResponse({ schema: publicSiteDocumentSchema }) page(@Param('slug') slug: string) { return this.site.publicDocument('page', slug); }
  @Get('settings') @ApiOkResponse({ schema: publicSiteDocumentSchema }) settings() { return this.site.singleton('settings'); }
  @Get('navigation') @ApiOkResponse({ schema: publicSiteDocumentSchema }) navigation() { return this.site.singleton('navigation'); }
  @Get('features') features() { return this.site.publicDocuments('feature'); }
  @Get('pricing') pricing() { return this.site.publicDocuments('pricing'); }
  @Get('faqs') faqs() { return this.site.publicDocuments('faq'); }
  @Get('articles') articles() { return this.site.publicDocuments('article'); }
  @Get('redirects') redirects(@Query('fromPath') fromPath?: string) { return this.site.redirects(undefined, fromPath); }
  @Post('submissions') @ApiBody({ schema: siteSubmissionSchema }) @ApiCreatedResponse({ schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, received: { type: 'boolean', enum: [true] } }, required: ['id', 'received'] } }) submit(@Body() body: unknown, @Req() request: Request) { return this.site.submit(body, request.ip ?? 'unknown', request.header('origin')); }
  @Get('media/:id') async media(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) { response.setHeader('Cache-Control', 'public, max-age=60'); response.redirect(302, await this.site.publicMedia(id)); }
}

@ApiTags('admin-site')
@Controller('admin/site')
@PlatformAdminOnly()
@UseInterceptors(NoStoreInterceptor)
export class AdminSiteController {
  constructor(private readonly site: SiteService) {}
  @Get('documents') @ApiOkResponse({ schema: { type: 'array', items: adminSiteDocumentSchema } }) documents(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query('kind') kind?: string, @Query('q') q?: string) { return this.site.list(admin, kind, q); }
  @Get('documents/:id') @ApiOkResponse({ schema: adminSiteDocumentSchema }) document(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.detail(admin, id); }
  @Get('documents/:id/preview') @ApiOkResponse({ schema: adminSiteDocumentSchema, description: 'Authenticated no-store draft preview. Never available through the public API.' }) preview(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.detail(admin, id, true); }
  @Post('documents') @RequireCsrf() @ApiBody({ schema: siteDocumentInputSchema }) @ApiCreatedResponse({ schema: adminSiteDocumentSchema }) create(@CurrentPlatformAdmin() admin: PlatformAdmin, @Body() body: unknown) { return this.site.create(admin, body); }
  @Put('documents/:id') @RequireCsrf() @ApiBody({ schema: siteDocumentInputSchema }) @ApiOkResponse({ schema: adminSiteDocumentSchema }) save(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.site.save(admin, id, body); }
  @Post('documents/:id/publish') @HttpCode(200) @RequireCsrf() publish(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.transition(admin, id, 'publish'); }
  @Post('documents/:id/unpublish') @HttpCode(200) @RequireCsrf() unpublish(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.transition(admin, id, 'unpublish'); }
  @Post('documents/:id/archive') @HttpCode(200) @RequireCsrf() archive(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.transition(admin, id, 'archive'); }
  @Get('documents/:id/revisions') revisions(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.revisions(admin, id); }
  @Post('documents/:id/restore') @HttpCode(200) @RequireCsrf() restore(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.site.restore(admin, id, body); }
  @Get('submissions') submissions(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query() query: { kind?: string; status?: string; q?: string; page?: string; limit?: string }) { return this.site.submissions(admin, query); }
  @Get('submissions/:id') submission(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.submission(admin, id); }
  @Patch('submissions/:id') @RequireCsrf() updateSubmission(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.site.updateSubmission(admin, id, body); }
  @Get('redirects') redirects(@CurrentPlatformAdmin() admin: PlatformAdmin) { return this.site.redirects(admin); }
  @Post('redirects') @RequireCsrf() redirect(@CurrentPlatformAdmin() admin: PlatformAdmin, @Body() body: unknown) { return this.site.addRedirect(admin, body); }
  @Delete('redirects/:id') @HttpCode(204) @RequireCsrf() deleteRedirect(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.deleteRedirect(admin, id); }
  @Get('activity') activity(@CurrentPlatformAdmin() admin: PlatformAdmin) { return this.site.activity(admin); }
  @Get('media') media(@CurrentPlatformAdmin() admin: PlatformAdmin, @Query('q') q?: string) { return this.site.mediaList(admin, q); }
  @Post('media') @RequireCsrf() mediaUpload(@CurrentPlatformAdmin() admin: PlatformAdmin, @Body() body: unknown) { return this.site.mediaUpload(admin, body); }
  @Post('media/:id/complete') @HttpCode(200) @RequireCsrf() mediaComplete(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) { return this.site.mediaComplete(admin, id); }
  @Patch('media/:id') @RequireCsrf() updateMedia(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.site.updateMedia(admin, id, body); }
}
