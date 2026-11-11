import { ValidationPipe } from '@nestjs/common';
import { BusinessException } from '../errors/business.exception';
import { ErrorCode } from '../errors/error-codes';
import { DISPOSABLE_EMAIL_MESSAGE } from '../validators/email-disposable.validator';

/** Utilisé aussi par les tests HTTP, afin de tester la même frontière que la production. */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    forbidUnknownValues: true,
    exceptionFactory: (errors) => {
      const formatted = errors.reduce<Record<string, string[]>>((acc, error) => {
        acc[error.property] = Object.values(error.constraints ?? {});
        return acc;
      }, {});
      return BusinessException.unprocessable(
        'Les données envoyées sont invalides.',
        Object.values(formatted).some((messages) => messages.includes(DISPOSABLE_EMAIL_MESSAGE))
          ? ErrorCode.DISPOSABLE_EMAIL_NOT_ALLOWED
          : ErrorCode.VALIDATION_ERROR,
        formatted,
      );
    },
  });
}
