import {
  CouponPageDto,
  CouponViewDto,
  CouponValidationDto,
  CheckoutOrderViewDto,
  PlanPriceViewDto,
  PlanCatalogDto,
} from './coupons.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiCreatedResponse, ApiNoContentResponse } from '@nestjs/swagger';
import { type AuthPrincipal } from '../../platform/http/request.js';
import { Authenticated, CurrentAuth } from '../auth/guards.js';
import { requireRole } from '../platform-admin/admin-roles.guard.js';
import { CurrentPlatformAdmin, type PlatformAdmin } from '../platform-admin/platform-admin.guard.js';
import { NoStoreInterceptor } from '../platform-admin/platform-admin.controller.js';
import {
  CouponQueryDto,
  CreateCheckoutOrderDto,
  CreateCouponDto,
  SetPlanPriceDto,
  ValidateCouponDto,
} from './coupons.dto.js';
import { CouponsService } from './coupons.service.js';

@ApiTags('admin-coupons')
@Controller('admin/coupons')
@requireRole('SUPER_ADMIN')
@UseInterceptors(NoStoreInterceptor)
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Get() @ApiOkResponse({ type: CouponPageDto }) list(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Query() query: CouponQueryDto,
  ) {
    return this.coupons.list(admin, query);
  }
  @Post() @ApiCreatedResponse({ type: CouponViewDto }) create(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Body() body: CreateCouponDto,
  ) {
    return this.coupons.create(admin, body);
  }
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  deactivate(@CurrentPlatformAdmin() admin: PlatformAdmin, @Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.deactivate(admin, id);
  }
}
@ApiTags('admin-billing')
@Controller('admin/billing/prices')
@requireRole('SUPER_ADMIN')
@UseInterceptors(NoStoreInterceptor)
export class AdminPlanPricesController {
  constructor(private readonly coupons: CouponsService) {}
  @Get() @ApiOkResponse({ type: PlanCatalogDto }) list(@CurrentPlatformAdmin() admin: PlatformAdmin) {
    return this.coupons.catalog(admin);
  }
  @Put() @ApiOkResponse({ type: PlanPriceViewDto }) set(
    @CurrentPlatformAdmin() admin: PlatformAdmin,
    @Body() body: SetPlanPriceDto,
  ) {
    return this.coupons.setPrice(admin, body);
  }
}
/** Authenticated owner-only validation: the server looks up the current price, never the browser. */
@ApiTags('coupons')
@Controller('coupons')
@Authenticated()
@UseInterceptors(NoStoreInterceptor)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Post('validate')
  @HttpCode(200)
  @ApiOkResponse({ type: CouponValidationDto })
  validate(@CurrentAuth() auth: AuthPrincipal, @Body() body: ValidateCouponDto) {
    return this.coupons.validate(body.workspaceId, auth.userId, body);
  }
}
@ApiTags('checkout')
@Controller('workspaces/:workspaceId/checkout')
@Authenticated()
@UseInterceptors(NoStoreInterceptor)
export class CheckoutOrdersController {
  constructor(private readonly coupons: CouponsService) {}
  @Get('catalog') @ApiOkResponse({ type: PlanPriceViewDto, isArray: true }) catalog(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('workspaceId', ParseUUIDPipe) id: string,
  ) {
    return this.coupons.checkoutCatalog(id, auth.userId);
  }
  @Post('orders') @ApiCreatedResponse({ type: CheckoutOrderViewDto }) create(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('workspaceId', ParseUUIDPipe) id: string,
    @Body() body: CreateCheckoutOrderDto,
  ) {
    return this.coupons.createOrder(id, auth.userId, body);
  }
  @Get('orders/:id') @ApiOkResponse({ type: CheckoutOrderViewDto }) get(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.coupons.getOrder(workspaceId, auth.userId, id);
  }
}
