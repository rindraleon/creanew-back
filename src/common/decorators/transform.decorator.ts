import { Transform } from 'class-transformer';

export function ApplyTransform<T>(fn: (params: { value: T }) => unknown): PropertyDecorator {
  return Transform((params) => fn({ value: params.value as T }));
}
