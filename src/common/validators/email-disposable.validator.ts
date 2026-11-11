import { domainToASCII } from 'node:url';
import { Transform } from 'class-transformer';
import {
  isEmail,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import disposableDomains from './disposable-domains.json';
import { BusinessException } from '../errors/business.exception';
import { ErrorCode } from '../errors/error-codes';

/** Snapshot CC0 versionné; pas de dépendance réseau au moment des requêtes. */
const blockedDomains = new Set<string>(disposableDomains);
export const INVALID_EMAIL_MESSAGE = 'Veuillez saisir une adresse e-mail valide.';
export const DISPOSABLE_EMAIL_MESSAGE =
  'Les adresses e-mail jetables ou temporaires ne sont pas acceptées.';

/** Même normalisation à l'entrée, à l'enregistrement et à la recherche. */
export function normalizeEmail(value: string): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return trimmed;
  // domainToASCII peut tronquer /, ? ou # comme une URL ; ne jamais rendre
  // valide une adresse malformée par normalisation.
  if (/\s/u.test(parts[1]) || [...'/?#:%[]\\'].some((character) => parts[1].includes(character)))
    return trimmed;
  // IDNA évite notamment le contournement par un domaine Unicode équivalent.
  const asciiDomain = domainToASCII(parts[1]);
  return `${parts[0]}@${asciiDomain || parts[1]}`;
}

/** Recherche exacte puis dans les domaines parents, sans confondre xfoo.com et foo.com. */
export function isDisposableDomain(domain: string | null): boolean {
  if (!domain) return false;
  let candidate = domainToASCII(domain.trim().toLowerCase());
  while (candidate) {
    if (blockedDomains.has(candidate)) return true;
    const dot = candidate.indexOf('.');
    if (dot < 0) break;
    candidate = candidate.slice(dot + 1);
  }
  return false;
}

export type EmailValidation =
  | { valid: true; normalized: string }
  | { valid: false; reason: 'invalid' | 'disposable'; normalized: string };

export function validateEmail(value: unknown): EmailValidation {
  if (typeof value !== 'string') return { valid: false, reason: 'invalid', normalized: '' };
  const normalized = normalizeEmail(value);
  // Limite conforme à la colonne users.email; pas de local part Unicode ou espaces internes.
  if (
    normalized.length > 190 ||
    !isEmail(normalized, { allow_utf8_local_part: false, require_tld: true })
  ) {
    return { valid: false, reason: 'invalid', normalized };
  }
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  if (isDisposableDomain(domain)) return { valid: false, reason: 'disposable', normalized };
  return { valid: true, normalized };
}

export function isDisposableEmail(value: string): boolean {
  const result = validateEmail(value);
  return !result.valid && result.reason === 'disposable';
}

/** Défense aussi dans les services et aux frontières d'envoi (pas seulement dans les DTO). */
export function assertValidEmail(value: unknown, field = 'email'): string {
  const result = validateEmail(value);
  if (!result.valid) {
    const message =
      result.reason === 'disposable' ? DISPOSABLE_EMAIL_MESSAGE : INVALID_EMAIL_MESSAGE;
    throw BusinessException.unprocessable(
      message,
      result.reason === 'disposable'
        ? ErrorCode.DISPOSABLE_EMAIL_NOT_ALLOWED
        : ErrorCode.VALIDATION_ERROR,
      { [field]: [message] },
    );
  }
  return result.normalized;
}

@ValidatorConstraint({ async: false, name: 'isSafeEmail' })
export class SafeEmailConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return validateEmail(value).valid;
  }
  defaultMessage(args: ValidationArguments): string {
    const result = validateEmail(args.value);
    return !result.valid && result.reason === 'disposable'
      ? DISPOSABLE_EMAIL_MESSAGE
      : INVALID_EMAIL_MESSAGE;
  }
}

export function IsSafeEmail(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyName),
      options,
      validator: SafeEmailConstraint,
    });
  };
}

/** À placer sur tout champ e-mail d'un DTO. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
}
