import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_TOMAN, type BillingPeriod, type DiscountType } from '@taskin/contracts';
const normalize = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
export class CreateCouponDto {
  @ApiProperty({ type: String })
  @Transform(normalize)
  @IsString()
  @Matches(/^[A-Z0-9]{3,40}$/)
  code!: string;
  @ApiProperty({ enum: ['PERCENTAGE', 'FIXED_AMOUNT'] })
  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  discountType!: DiscountType;
  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_TOMAN })
  @IsInt()
  @Min(1)
  @Max(MAX_TOMAN)
  discountValue!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_TOMAN)
  maxDiscountAmount?: number | null;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_TOMAN)
  minOrderAmount?: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  usageLimit?: number | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  @ApiPropertyOptional({ type: [String] })
  allowedPlans?: string[];
}
export class CouponQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(normalize)
  @IsString()
  @Matches(/^[A-Z0-9]{1,40}$/)
  code?: string;
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  cursor?: string;
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
export class SelectionDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 50)
  planId!: string;
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  period!: BillingPeriod;
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @Transform(normalize)
  @Matches(/^[A-Z0-9]{3,40}$/)
  @ApiPropertyOptional({ type: String, pattern: '^[A-Z0-9]{3,40}$' })
  code?: string;
}
export class ValidateCouponDto extends SelectionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  workspaceId!: string;
}
export class CreateCheckoutOrderDto extends SelectionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  commandId!: string;
}
export class SetPlanPriceDto {
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 50)
  planId!: string;
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  period!: BillingPeriod;
  @ApiProperty({ type: Number, minimum: 0, maximum: MAX_TOMAN })
  @IsInt()
  @Min(0)
  @Max(MAX_TOMAN)
  amountToman!: number;
  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_o, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
export class DiscountBreakdownDto {
  @ApiProperty({ enum: ['TOMAN'] }) currency!: 'TOMAN';
  @ApiProperty({ minimum: 0, maximum: MAX_TOMAN }) subtotal!: number;
  @ApiProperty({ minimum: 0, maximum: MAX_TOMAN }) discount!: number;
  @ApiProperty({ minimum: 0, maximum: MAX_TOMAN }) total!: number;
}
export class CouponValidationDto {
  @ApiProperty() valid!: boolean;
  @ApiPropertyOptional({ type: DiscountBreakdownDto }) breakdown?: DiscountBreakdownDto;
  @ApiPropertyOptional({
    enum: [
      'INVALID',
      'INACTIVE',
      'EXPIRED',
      'EXHAUSTED',
      'PLAN_INELIGIBLE',
      'MINIMUM_NOT_MET',
      'PRICE_UNAVAILABLE',
    ],
  })
  reason?: string;
}
export class CouponViewDto extends CreateCouponDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ minimum: 0 }) usedCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class CouponPageDto {
  @ApiProperty({ type: [CouponViewDto] }) items!: CouponViewDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class CheckoutOrderViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['pending', 'paid'] }) status!: string;
  @ApiProperty() planId!: string;
  @ApiProperty({ enum: ['monthly', 'yearly'] }) period!: string;
  @ApiProperty({ type: DiscountBreakdownDto }) breakdown!: DiscountBreakdownDto;
  @ApiProperty({ format: 'date-time' }) reservationExpiresAt!: string;
}
export class PlanPriceViewDto extends SetPlanPriceDto {
  @ApiPropertyOptional() planName?: string;
}
export class PlanCatalogDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name'],
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    },
  })
  plans!: { id: string; name: string }[];
  @ApiProperty({ type: [PlanPriceViewDto] }) prices!: PlanPriceViewDto[];
}
