import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import type {
  AuthMethod,
  AuthSession,
  AvatarTone,
  MeUser,
  OtpChallenge,
  OtpRequestBody,
  OtpVerifyBody,
  SessionView,
  SetPasswordBody,
  SignupBody,
  StepUpBody,
} from '@taskin/contracts';
import { OTP_LENGTH } from './otp.service.js';

/* Request bodies: validated DTO classes that implement the shared contract interfaces. */

export class OtpRequestDto implements OtpRequestBody {
  @ApiProperty({ example: '0912 123 4567', description: 'Any written form of an Iranian mobile number, Persian digits included' })
  @IsString()
  @Length(10, 24)
  readonly phone!: string;
}

export class OtpVerifyDto implements OtpVerifyBody {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly challengeId!: string;

  @ApiProperty({ example: '482913', description: `${OTP_LENGTH} digits` })
  @IsString()
  @Matches(new RegExp(`^[0-9]{${OTP_LENGTH}}$`), { message: `code must be ${OTP_LENGTH} digits` })
  readonly code!: string;

  @ApiPropertyOptional({ example: 'کروم روی ویندوز' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  readonly deviceLabel?: string;
}

export class SignupDto implements SignupBody {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  readonly signupToken!: string;

  @ApiProperty({ example: 'مریم احمدی', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  readonly fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  readonly deviceLabel?: string;
}

export class StepUpDto implements StepUpBody {
  @ApiProperty({ format: 'password' })
  @IsString()
  @Length(1, 128)
  readonly password!: string;
}

export class SetPasswordDto implements SetPasswordBody {
  @ApiPropertyOptional({ format: 'password' })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  readonly currentPassword?: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128 })
  @IsString()
  @Length(8, 128)
  readonly newPassword!: string;
}

/* Responses: documented shapes of the contract types the controllers return. */

export class OtpChallengeDto implements OtpChallenge {
  @ApiProperty({ format: 'uuid' }) readonly challengeId!: string;
  @ApiProperty({ example: OTP_LENGTH }) readonly codeLength!: number;
  @ApiProperty({ example: 120 }) readonly expiresInSeconds!: number;
  @ApiProperty({ example: 60 }) readonly resendInSeconds!: number;
}

export class MeUserDto implements MeUser {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ example: '+989121234567' }) readonly phone!: string;
  @ApiProperty({ type: String, nullable: true }) readonly email!: string | null;
  @ApiProperty() readonly fullName!: string;
  @ApiProperty({ enum: ['brand', 'teal', 'violet', 'amber', 'rose', 'slate'] }) readonly avatarTone!: AvatarTone;
  @ApiProperty({ example: 'fa-IR' }) readonly locale!: string;
  @ApiProperty({ example: 'Asia/Tehran' }) readonly timeZone!: string;
  @ApiProperty() readonly hasPassword!: boolean;
}

export class AuthSessionDto implements AuthSession {
  @ApiProperty() readonly accessToken!: string;
  @ApiProperty({ enum: ['Bearer'] }) readonly tokenType!: 'Bearer';
  @ApiProperty({ example: 900 }) readonly expiresInSeconds!: number;
  @ApiProperty({ format: 'uuid' }) readonly sessionId!: string;
  @ApiProperty({ type: MeUserDto }) readonly user!: MeUser;
}

export class SessionViewDto implements SessionView {
  @ApiProperty({ format: 'uuid' }) readonly id!: string;
  @ApiProperty({ type: String, nullable: true }) readonly deviceLabel!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly userAgent!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly ip!: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly city!: string | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt!: string;
  @ApiProperty({ format: 'date-time' }) readonly lastActiveAt!: string;
  @ApiProperty() readonly current!: boolean;
}

export const AUTH_METHODS: readonly AuthMethod[] = ['otp', 'pwd'];
