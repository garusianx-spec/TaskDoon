import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  PlatformHealth,
  PlatformMetrics,
  PlatformOutboxHealth,
  PlatformProbe,
  PlatformQueueFailure,
  PlatformQueueHealth,
  PlatformSmsProvider,
} from '@taskin/contracts';

type UserMetrics = PlatformMetrics['users'];
type WorkspaceMetrics = PlatformMetrics['workspaces'];
type ContentMetrics = PlatformMetrics['content'];
type ServiceHealth = PlatformHealth['services'];
type SmsHealth = PlatformHealth['sms'];
type QueueCounts = PlatformQueueHealth['counts'];
type OutboxPending = PlatformOutboxHealth['pending'];

export class PlatformUserMetricsDto implements UserMetrics {
  @ApiProperty({ type: Number, minimum: 0, description: 'All retained users, including deleted accounts' }) readonly total!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly active!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly suspended!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly newLast7Days!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly newLast30Days!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Distinct active users with session activity during the last seven days' }) readonly activeLast7Days!: number;
}

export class PlatformWorkspaceMetricsDto implements WorkspaceMetrics {
  @ApiProperty({ type: Number, minimum: 0, description: 'All retained workspaces, including trash' }) readonly total!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly active!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly suspended!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly deleted!: number;
}

export class PlatformContentMetricsDto implements ContentMetrics {
  @ApiProperty({ type: Number, minimum: 0, description: 'Ready files not deleted, in workspaces not deleted' }) readonly readyFiles!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Storage usage recorded for workspaces not deleted' }) readonly storageUsedBytes!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Tasks not deleted, in workspaces not deleted' }) readonly tasks!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Messages not deleted, in workspaces not deleted' }) readonly messages!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly messagesLast7Days!: number;
}

export class PlatformMetricsDto implements PlatformMetrics {
  @ApiProperty({ type: String, format: 'date-time' }) readonly generatedAt!: string;
  @ApiProperty({ type: Boolean, description: 'This response was served from the 60-second metrics cache' }) readonly cached!: boolean;
  @ApiProperty({ type: PlatformUserMetricsDto }) readonly users!: PlatformUserMetricsDto;
  @ApiProperty({ type: PlatformWorkspaceMetricsDto }) readonly workspaces!: PlatformWorkspaceMetricsDto;
  @ApiProperty({ type: PlatformContentMetricsDto }) readonly content!: PlatformContentMetricsDto;
}

export class PlatformProbeDto implements PlatformProbe {
  @ApiProperty({ type: Boolean }) readonly ok!: boolean;
  @ApiProperty({ type: Number, minimum: 0, description: 'Dependency readiness probe duration in milliseconds' }) readonly latencyMs!: number;
  @ApiPropertyOptional({ type: String, description: 'Generic timeout or unavailable status, without connection details' }) readonly error?: string;
}

export class PlatformServiceHealthDto implements ServiceHealth {
  @ApiProperty({ type: PlatformProbeDto }) readonly database!: PlatformProbeDto;
  @ApiProperty({ type: PlatformProbeDto }) readonly adminPool!: PlatformProbeDto;
  @ApiProperty({ type: PlatformProbeDto }) readonly redisCore!: PlatformProbeDto;
  @ApiProperty({ type: PlatformProbeDto }) readonly redisRt!: PlatformProbeDto;
  @ApiProperty({ type: PlatformProbeDto }) readonly storage!: PlatformProbeDto;
}

export class PlatformSmsProviderDto implements PlatformSmsProvider {
  @ApiProperty({ type: String }) readonly name!: string;
  @ApiProperty({ type: Number, minimum: 0 }) readonly failures!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Breaker reopening time, or null when the circuit is closed' }) readonly openUntil!: string | null;
}

export class PlatformSmsHealthDto implements SmsHealth {
  @ApiProperty({ type: PlatformSmsProviderDto, isArray: true, description: 'Passive state of configured providers; no SMS is sent by this check' }) readonly providers!: PlatformSmsProviderDto[];
  @ApiProperty({ type: Number, minimum: 0, nullable: true, description: 'Failed notification queue jobs, including SMS/email; null if the queue cannot be read' }) readonly failedJobs!: number | null;
}

export class PlatformHealthDto implements PlatformHealth {
  @ApiProperty({ type: String, format: 'date-time' }) readonly checkedAt!: string;
  @ApiProperty({ type: PlatformServiceHealthDto }) readonly services!: PlatformServiceHealthDto;
  @ApiProperty({ type: PlatformSmsHealthDto }) readonly sms!: PlatformSmsHealthDto;
}

export class PlatformQueueCountsDto implements QueueCounts {
  @ApiProperty({ type: Number, minimum: 0 }) readonly waiting!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly active!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly delayed!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly failed!: number;
  @ApiProperty({ type: Number, minimum: 0 }) readonly paused!: number;
}

export class PlatformQueueFailureDto implements PlatformQueueFailure {
  @ApiProperty({ type: String, maxLength: 200 }) readonly name!: string;
  @ApiProperty({ type: Number, minimum: 0 }) readonly attempts!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readonly failedAt!: string | null;
  @ApiProperty({ type: String, maxLength: 200, description: 'Sanitized failure summary, without job data or stack trace' }) readonly reason!: string;
}

export class PlatformQueueHealthDto implements PlatformQueueHealth {
  @ApiProperty({ type: String, enum: ['notifications', 'work', 'maintenance'] }) readonly name!: PlatformQueueHealth['name'];
  @ApiProperty({ type: PlatformQueueCountsDto }) readonly counts!: PlatformQueueCountsDto;
  @ApiProperty({ type: PlatformQueueFailureDto, isArray: true, maxItems: 10 }) readonly recentFailures!: PlatformQueueFailureDto[];
  @ApiPropertyOptional({ type: String, description: 'Queue unavailable or timed out; counts cannot be trusted while this field is present' }) readonly error?: string;
}

export class PlatformOutboxPendingDto implements OutboxPending {
  @ApiProperty({ type: Number, minimum: 0 }) readonly count!: number;
  @ApiProperty({ type: Number, minimum: 0, description: 'Age of the oldest unpublished event in seconds, or zero when empty' }) readonly oldestAgeSeconds!: number;
}

export class PlatformOutboxHealthDto implements PlatformOutboxHealth {
  @ApiProperty({ type: String, format: 'date-time' }) readonly checkedAt!: string;
  @ApiProperty({ type: PlatformOutboxPendingDto }) readonly pending!: PlatformOutboxPendingDto;
  @ApiProperty({ type: PlatformQueueHealthDto, isArray: true }) readonly queues!: PlatformQueueHealthDto[];
}
