import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = Symbol('taskin:public');

/** Skips JwtAuthGuard: health checks and the sign-in flow. Everything else needs a token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
