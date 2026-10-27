import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * Valide qu'un paramètre d'URL est un UUID.
 *
 * Pourquoi : sans ce garde, une URL trafiquée comme `/api/orders/inconnu`
 * atteignait PostgreSQL, qui rejetait la valeur avec l'erreur `22P02`
 * (« invalid input syntax for type uuid »). La requête remontait alors en
 * 500 Internal Server Error au lieu d'un 400 exploitable par le client —
 * et le front affichait un écran sans contenu.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): string {
    if (typeof value !== 'string' || !isUUID(value, 'all')) {
      throw new BadRequestException('Identifiant invalide.');
    }
    return value;
  }
}
