import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Log structuré : méthode, URL, statut, durée, requestId. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - started;
        this.logger.log(
          JSON.stringify({
            requestId: request.id,
            method: request.method,
            path: request.url,
            status: response.statusCode,
            durationMs: duration,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          }),
        );
      }),
    );
  }
}
