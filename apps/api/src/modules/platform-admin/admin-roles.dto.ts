import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, ValidateIf, IsString, Length, MaxLength } from 'class-validator';
import type { AssignAdminRoleBody, UpdateAdminRoleBody, PlatformAdminRole, AdministrativeStatus } from '@taskin/contracts';
export class AssignAdminRoleDto implements AssignAdminRoleBody {
  @ApiProperty() @IsString() @Length(10, 24) readonly phone!: string;
  @ApiProperty() @IsString() @Length(2, 80) readonly fullName!: string;
  @ApiProperty() @IsEmail() @MaxLength(254) readonly recoveryEmail!: string;
  @ApiProperty({ enum: ['ADMIN', 'OPERATOR'] }) @IsIn(['ADMIN', 'OPERATOR']) readonly role!: 'ADMIN' | 'OPERATOR';
}
export class UpdateAdminRoleDto implements UpdateAdminRoleBody {
  @ApiPropertyOptional({ enum: ['ADMIN', 'OPERATOR'] }) @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @IsIn(['ADMIN', 'OPERATOR']) readonly role?: 'ADMIN' | 'OPERATOR';
  @ApiPropertyOptional() @ValidateIf((_object: unknown, value: unknown) => value !== undefined) @IsBoolean() readonly suspended?: boolean;
}

export class AdministrativeUserDto {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty() readonly phone!: string;
  @ApiProperty({ type: String, nullable: true }) readonly email!: string | null;
  @ApiProperty({ enum: ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] }) readonly role!: PlatformAdminRole;
  @ApiProperty({ enum: ['ACTIVE', 'PENDING_SETUP', 'SUSPENDED'] }) readonly status!: AdministrativeStatus;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty() readonly protected!: boolean;
}
