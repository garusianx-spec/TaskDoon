import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ActiveBroadcasts } from '@taskin/contracts';
import { ActiveBroadcastsDto } from './broadcasts.dto.js';
import { BroadcastsService } from './broadcasts.service.js';

@ApiTags('broadcasts')
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get('active')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Current platform announcements for every authenticated user' })
  @ApiOkResponse({ type: ActiveBroadcastsDto })
  active(): Promise<ActiveBroadcasts> { return this.broadcasts.active(); }
}
