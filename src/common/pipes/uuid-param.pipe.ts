import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): string {
    if (typeof value !== 'string' || !isUUID(value, 'all')) {
      throw new BadRequestException('Identifiant invalide.');
    }
    return value;
  }
}
