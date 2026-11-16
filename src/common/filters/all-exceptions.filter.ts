import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BusinessException } from '../errors/business.exception';
import { ErrorCode } from '../errors/error-codes';
import type { ApiErrorResponse } from '../interfaces/error-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const status: HttpStatus =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Une erreur inattendue est survenue.';
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;

    // Erreurs d'upload (fichier trop volumineux) : Nest encapsule l'erreur
    // multer dans une exception dont le message reste anglais.
    const uploadError = this.translateUploadError(exception);
    if (uploadError) {
      this.respondWithTranslatedError(response, request, uploadError, HttpStatus.PAYLOAD_TOO_LARGE);
      return;
    }

    // Garde-fou : une valeur non-UUID qui atteindrait quand même la base
    // (requête brute, filtre, ordre de tri…) doit ressortir en 400, pas en 500.
    const uuidError = this.translateUuidError(exception);
    if (uuidError) {
      this.respondWithTranslatedError(response, request, uuidError, HttpStatus.BAD_REQUEST);
      return;
    }

    const details = this.getErrorDetails(exception, status);
    message = details.message;
    code = details.code;
    const errors = details.errors;

    // Les erreurs 500 ne doivent jamais exposer le message interne.
    message = this.logException(exception, request, status, code, message);

    const body: ApiErrorResponse = {
      statusCode: status,
      message,
      code,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.path,
      ...(request.id ? { requestId: request.id } : {}),
    };

    response.status(status).json(body);
  }

  private respondWithTranslatedError(
    response: Response,
    request: Request & { id?: string },
    error: { message: string; code: ErrorCode },
    status: HttpStatus,
  ): void {
    this.logger.warn(`${request.method} ${request.path} → ${status} [${error.code}]`);
    response.status(status).json({
      statusCode: status,
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      path: request.path,
      ...(request.id ? { requestId: request.id } : {}),
    } satisfies ApiErrorResponse);
  }

  private getErrorDetails(
    exception: unknown,
    status: HttpStatus,
  ): { message: string | string[]; code: ErrorCode; errors?: Record<string, string[]> } {
    let message: string | string[] = 'Une erreur inattendue est survenue.';
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof BusinessException) {
      message = (exception.getResponse() as { message: string | string[] }).message;
      code = exception.code as ErrorCode;
      errors = exception.details as Record<string, string[]> | undefined;
    } else if (exception instanceof HttpException) {
      ({ message, code, errors } = this.getHttpErrorDetails(exception, status, {
        message,
        code,
        errors,
      }));
    }

    return { message, code, errors };
  }

  private getHttpErrorDetails(
    exception: HttpException,
    status: HttpStatus,
    details: { message: string | string[]; code: ErrorCode; errors?: Record<string, string[]> },
  ): { message: string | string[]; code: ErrorCode; errors?: Record<string, string[]> } {
    let { message, code, errors } = details;
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      message = payload;
    } else if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      message = (record.message as string | string[]) ?? message;
      if (Array.isArray(record.message)) {
        errors = { _: record.message as string[] };
      }
      if (typeof record.error === 'string' && record.error) {
        code = this.mapStatusToCode(status, record.error);
      }
    }
    code = code === ErrorCode.INTERNAL_ERROR ? this.mapStatusToCode(status) : code;
    return { message, code, errors };
  }

  private logException(
    exception: unknown,
    request: Request,
    status: HttpStatus,
    code: ErrorCode,
    message: string | string[],
  ): string | string[] {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.path} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return process.env.NODE_ENV === 'production' ? 'Une erreur interne est survenue.' : message;
    }

    this.logger.warn(
      `${request.method} ${request.path} → ${status} [${code}] ${
        Array.isArray(message) ? message.join(' | ') : message
      }`,
    );
    return message;
  }

  /** Traduit une erreur d'upload en message français actionnable. */
  private translateUploadError(exception: unknown): { message: string; code: ErrorCode } | null {
    // Nest encapsule les erreurs multer dans une `PayloadTooLargeException` :
    // c'est son message anglais qu'il faut remplacer.
    if (
      exception instanceof HttpException &&
      Number(exception.getStatus()) === Number(HttpStatus.PAYLOAD_TOO_LARGE)
    ) {
      return {
        message: 'Fichier trop volumineux : 10 Mo maximum par fichier.',
        code: ErrorCode.PAYLOAD_TOO_LARGE,
      };
    }

    // Filet de sécurité : multer lève parfois l'erreur brute.
    const rawCode: unknown = (exception as { code?: unknown } | null | undefined)?.code;
    if (typeof rawCode === 'string' && rawCode.startsWith('LIMIT_')) {
      return {
        message: "Fichier refusé par les limites d'envoi.",
        code: ErrorCode.PAYLOAD_TOO_LARGE,
      };
    }

    return null;
  }

  private translateUuidError(exception: unknown): { message: string; code: ErrorCode } | null {
    const driverError = (exception as { code?: unknown; driverError?: { code?: unknown } } | null)
      ?.driverError;
    const code: unknown =
      (exception as { code?: unknown } | null | undefined)?.code ??
      (driverError as { code?: unknown } | undefined)?.code;
    if (code !== '22P02') return null;
    return {
      message: 'Identifiant invalide.',
      code: ErrorCode.VALIDATION_ERROR,
    };
  }

  private mapStatusToCode(status: HttpStatus, fallback?: string): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return ErrorCode.INTERNAL_ERROR;
      default:
        return (fallback as ErrorCode) ?? ErrorCode.BAD_REQUEST;
    }
  }
}
