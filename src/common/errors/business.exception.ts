import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface BusinessExceptionOptions {
  code?: ErrorCode | string;
  details?: unknown;
  cause?: unknown;
}

export class BusinessException extends HttpException {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string | string[],
    status: HttpStatus | number = HttpStatus.BAD_REQUEST,
    options: BusinessExceptionOptions = {},
  ) {
    super(
      {
        message,
        code: options.code ?? ErrorCode.BAD_REQUEST,
        details: options.details,
      },
      status,
      { cause: options.cause },
    );
    this.code = options.code ?? ErrorCode.BAD_REQUEST;
    this.details = options.details;
  }

  static notFound(
    message: string,
    code: ErrorCode | string = ErrorCode.NOT_FOUND,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.NOT_FOUND, { code });
  }

  static conflict(
    message: string,
    code: ErrorCode | string = ErrorCode.CONFLICT,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.CONFLICT, { code });
  }

  static forbidden(
    message: string,
    code: ErrorCode | string = ErrorCode.FORBIDDEN,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.FORBIDDEN, { code });
  }

  static unauthorized(
    message: string,
    code: ErrorCode | string = ErrorCode.UNAUTHORIZED,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.UNAUTHORIZED, { code });
  }

  static badRequest(
    message: string | string[],
    code: ErrorCode | string = ErrorCode.BAD_REQUEST,
    details?: unknown,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.BAD_REQUEST, { code, details });
  }

  static tooManyRequests(
    message: string,
    code: ErrorCode | string = ErrorCode.TOO_MANY_REQUESTS,
    details?: unknown,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.TOO_MANY_REQUESTS, {
      code,
      details,
    });
  }

  static unprocessable(
    message: string | string[],
    code: ErrorCode | string = ErrorCode.VALIDATION_ERROR,
    details?: unknown,
  ): BusinessException {
    return new BusinessException(message, HttpStatus.UNPROCESSABLE_ENTITY, {
      code,
      details,
    });
  }
}
