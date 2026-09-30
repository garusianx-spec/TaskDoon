import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { AppConfig } from '../../config/app-config.js';
import { RequestContext } from '../context/request-context.js';

/**
 * In tests only: reports how many SQL statements a request ran (`X-Sql-Count`), guards included.
 * The integration suite holds endpoints to a budget with it, which is how N+1 regressions fail CI.
 */
@Injectable()
export class SqlCountInterceptor implements NestInterceptor {
  constructor(
    private readonly config: AppConfig,
    private readonly context: RequestContext,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.isTest || execution.getType() !== 'http') return next.handle();
    const response = execution.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        if (!response.headersSent) response.setHeader('X-Sql-Count', String(this.context.sqlCount));
      }),
    );
  }
}
