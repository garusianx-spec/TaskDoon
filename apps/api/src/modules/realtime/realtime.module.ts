import { Module } from '@nestjs/common';
import { DomainModule } from '../domain.module.js';
import { PresenceTracker } from './presence-tracker.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RoomScope } from './room-scope.js';

/** The Socket.IO gateway and what only it needs (the `ws` role, and `all` for local work). */
@Module({
  imports: [DomainModule],
  providers: [RealtimeGateway, RoomScope, PresenceTracker],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
