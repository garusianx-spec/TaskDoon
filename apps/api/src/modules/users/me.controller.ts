import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import type { AvatarTone, MeResponse, MeUser, MeWorkspace, RoleId, UpdateMeBody } from '@taskin/contracts';
import { ROLE_IDS } from '@taskin/contracts';
import type { AuthPrincipal } from '../../platform/http/request.js';
import { MeUserDto } from '../auth/auth.dto.js';
import { Authenticated, CurrentAuth } from '../auth/guards.js';
import { UsersService } from './users.service.js';

export const AVATAR_TONES: readonly AvatarTone[] = ['brand', 'teal', 'violet', 'amber', 'rose', 'slate'];

export class UpdateMeDto implements UpdateMeBody {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  readonly fullName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail({ allow_utf8_local_part: false })
  readonly email?: string | null;

  @ApiPropertyOptional({ enum: AVATAR_TONES })
  @IsOptional()
  @IsIn(AVATAR_TONES)
  readonly avatarTone?: AvatarTone;
}

export class MeWorkspaceDto implements MeWorkspace {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty() readonly slug!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty() readonly initials!: string;
  @ApiProperty({ enum: AVATAR_TONES }) readonly tone!: AvatarTone;
  @ApiProperty({ type: String, nullable: true }) readonly iconUrl!: string | null;
  @ApiProperty({ enum: ROLE_IDS }) readonly role!: RoleId;
  @ApiProperty() readonly isOwner!: boolean;
}

export class MeResponseDto implements MeResponse {
  @ApiProperty({ type: MeUserDto }) readonly user!: MeUser;
  @ApiProperty({ type: MeWorkspaceDto, isArray: true }) readonly workspaces!: MeWorkspace[];
}

@ApiTags('me')
@Authenticated()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user and their workspaces (the switcher)' })
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentAuth() principal: AuthPrincipal): Promise<MeResponse> {
    return this.users.me(principal.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the profile' })
  @ApiOkResponse({ type: MeUserDto })
  update(@CurrentAuth() principal: AuthPrincipal, @Body() body: UpdateMeDto): Promise<MeUser> {
    return this.users.update(principal.userId, body);
  }
}
