import fs from 'node:fs';
import path from 'node:path';
const root='C:/Users/garus/OneDrive/Desktop/taskin';
function write(p,s){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);}
write('apps/api/src/modules/broadcasts/broadcasts.dto.ts', `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';
import { BROADCAST_LEVELS, type BroadcastLevel, type CreateBroadcastBody, type UpdateBroadcastBody } from '@taskin/contracts';

const trimMessage = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;

export class CreateBroadcastDto implements CreateBroadcastBody {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimMessage) @IsString() @Length(1, 500)
  message!: string;

  @ApiProperty({ enum: BROADCAST_LEVELS }) @IsIn(BROADCAST_LEVELS)
  level!: BroadcastLevel;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true })
  startsAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean()
  isActive?: boolean;
}

export class UpdateBroadcastDto implements UpdateBroadcastBody {
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @Transform(trimMessage) @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(1, 500)
  message?: string;

  @ApiPropertyOptional({ enum: BROADCAST_LEVELS })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(BROADCAST_LEVELS)
  level?: BroadcastLevel;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true })
  startsAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null) @IsISO8601({ strict: true })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean()
  isActive?: boolean;
}

export class BroadcastQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200)
  cursor?: string;

  @ApiPropertyOptional({ enum: ['current', 'archived', 'all'], default: 'current' })
  @IsOptional() @IsIn(['current', 'archived', 'all'])
  status?: 'current' | 'archived' | 'all';
}

export class ActiveBroadcastViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minLength: 1, maxLength: 500 }) message!: string;
  @ApiProperty({ enum: BROADCAST_LEVELS }) level!: BroadcastLevel;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ActiveBroadcastsDto {
  @ApiProperty({ type: [ActiveBroadcastViewDto] }) items!: ActiveBroadcastViewDto[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) nextChangeAt!: string | null;
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
}

export class SystemBroadcastViewDto extends ActiveBroadcastViewDto {
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty() createdByName!: string;
}

export class SystemBroadcastPageDto {
  @ApiProperty({ type: [SystemBroadcastViewDto] }) items!: SystemBroadcastViewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
`);
write('apps/api/src/modules/broadcasts/broadcasts.service.ts', `import { Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import { BROADCAST_LEVELS, type ActiveBroadcasts, type ActiveBroadcastView, type BroadcastLevel } from '@taskin/contracts';
import { Clock } from '../../platform/clock/clock.js';
import { systemBroadcasts } from '../../platform/db/schema/all.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { RedisClients } from '../../platform/redis/redis.js';

/** Only eligible candidates are cached: future starts stay here so time transitions need no write. */
export interface ActiveBroadcastCandidate extends ActiveBroadcastView {
  readonly createdAt: string;
}

const PRIORITY: Readonly<Record<BroadcastLevel, number>> = { critical: 0, warning: 1, info: 2 };
const CACHE_TTL_SECONDS = 30;
const INVALIDATE = "local generation = redis.call('INCR', KEYS[1]); redis.call('DEL', KEYS[2]); return tostring(generation)";
const FILL = "if (redis.call('GET', KEYS[1]) or '0') == ARGV[1] then return redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]) end return nil";

export function activeBroadcastsFromRows(rows: readonly ActiveBroadcastCandidate[], now: Date): ActiveBroadcasts {
  const instant = now.getTime();
  const items = rows
    .filter((row) => Date.parse(row.startsAt) <= instant && (row.expiresAt === null || Date.parse(row.expiresAt) > instant))
    .sort((a, b) => PRIORITY[a.level] - PRIORITY[b.level] || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
    .map(({ id, message, level, startsAt, expiresAt, updatedAt }) => ({ id, message, level, startsAt, expiresAt, updatedAt }));
  let next = Infinity;
  for (const row of rows) {
    const start = Date.parse(row.startsAt);
    const expiry = row.expiresAt === null ? Infinity : Date.parse(row.expiresAt);
    if (start > instant && expiry > start) next = Math.min(next, start);
    if (expiry > instant && expiry !== Infinity) next = Math.min(next, expiry);
  }
  return { items, nextChangeAt: Number.isFinite(next) ? new Date(next).toISOString() : null, serverNow: now.toISOString() };
}

function candidate(value: unknown): value is ActiveBroadcastCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.message === 'string' &&
    typeof row.level === 'string' && BROADCAST_LEVELS.includes(row.level as BroadcastLevel) &&
    typeof row.startsAt === 'string' && Number.isFinite(Date.parse(row.startsAt)) &&
    (row.expiresAt === null || (typeof row.expiresAt === 'string' && Number.isFinite(Date.parse(row.expiresAt)))) &&
    typeof row.updatedAt === 'string' && Number.isFinite(Date.parse(row.updatedAt)) &&
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt));
}

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger('BroadcastsService');
  constructor(private readonly uow: UnitOfWork, private readonly redis: RedisClients, private readonly clock: Clock) {}

  async active(): Promise<ActiveBroadcasts> {
    let generation: string | null = null;
    try {
      const [cached, version] = await this.redis.core.mget(this.cacheKey(), this.generationKey());
      generation = version ?? '0';
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every(candidate)) return activeBroadcastsFromRows(parsed, this.clock.now());
        this.logger.warn({ event: 'broadcast.cache.invalid' }, 'Ignoring invalid broadcast cache');
      }
    } catch {
      this.logger.warn({ event: 'broadcast.cache.read_failed' }, 'Reading broadcasts from database');
    }
    const rows = await this.load();
    if (generation !== null) await this.fill(rows, generation);
    return activeBroadcastsFromRows(rows, this.clock.now());
  }

  /** After COMMIT: atomically invalidate, then write through without letting older fills win. */
  async afterChange(): Promise<void> {
    try {
      const generation = String(await this.redis.core.eval(INVALIDATE, 2, this.generationKey(), this.cacheKey()));
      await this.fill(await this.load(), generation);
    } catch {
      this.logger.warn({ event: 'broadcast.cache.refresh_failed' }, 'Committed broadcast cache refresh failed');
    }
  }

  private async load(): Promise<ActiveBroadcastCandidate[]> {
    const now = this.clock.now();
    return this.uow.run({ workspaceId: null, userId: null }, async ({ tx }) => {
      const rows = await tx.select({
        id: systemBroadcasts.id, message: systemBroadcasts.message, level: systemBroadcasts.level,
        startsAt: systemBroadcasts.startsAt, expiresAt: systemBroadcasts.expiresAt,
        updatedAt: systemBroadcasts.updatedAt, createdAt: systemBroadcasts.createdAt,
      }).from(systemBroadcasts).where(and(
        eq(systemBroadcasts.isActive, true), isNull(systemBroadcasts.archivedAt),
        or(isNull(systemBroadcasts.expiresAt), gt(systemBroadcasts.expiresAt, now)),
      )).orderBy(asc(systemBroadcasts.startsAt));
      return rows.map((row) => ({ ...row, startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString() }));
    });
  }

  private async fill(rows: readonly ActiveBroadcastCandidate[], generation: string): Promise<void> {
    try {
      await this.redis.core.eval(FILL, 2, this.generationKey(), this.cacheKey(), generation, JSON.stringify(rows), CACHE_TTL_SECONDS);
    } catch {
      this.logger.warn({ event: 'broadcast.cache.write_failed' }, 'Broadcast cache write failed');
    }
  }
  private cacheKey(): string { return this.redis.key('cache', 'broadcasts', 'active'); }
  private generationKey(): string { return this.redis.key('cache', 'broadcasts', 'generation'); }
}
`);
write('apps/api/src/modules/broadcasts/broadcasts.controller.ts', `import { Controller, Get, Header } from '@nestjs/common';
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
`);
