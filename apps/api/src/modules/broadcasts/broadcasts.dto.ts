import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
