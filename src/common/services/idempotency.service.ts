import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { BusinessException } from '../errors/business.exception';
import { ErrorCode } from '../errors/error-codes';

export interface IdempotencyResult<T> {
  result: T;
  replayed: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  async run<T>(
    scope: string,
    key: string | undefined,
    userId: string | null,
    payload: unknown,
    handler: () => Promise<T>,
  ): Promise<IdempotencyResult<T>> {
    if (!key) return { result: await handler(), replayed: false };

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload ?? {}))
      .digest('hex');

    const existing = await this.keys.findOne({ where: { scope, key } });
    if (existing) {
      if (existing.expiresAt.getTime() < Date.now()) {
        await this.keys.remove(existing);
      } else if (existing.requestHash !== requestHash) {
        throw BusinessException.conflict(
          'Cette clé d’idempotence a déjà été utilisée avec des données différentes.',
          ErrorCode.VALIDATION_ERROR,
        );
      } else {
        return { result: existing.response as T, replayed: true };
      }
    }

    const result = await handler();

    try {
      await this.keys.save(
        this.keys.create({
          scope,
          key,
          userId,
          requestHash,
          response: result as unknown as Record<string, unknown>,
          statusCode: 201,
          expiresAt: new Date(Date.now() + TTL_MS),
        }),
      );
    } catch (error) {
      // Contrainte unique : une requête concurrente a gagné, on renvoie la sienne.
      const winner = await this.keys.findOne({ where: { scope, key } });
      if (winner) return { result: winner.response as T, replayed: true };
      this.logger.warn(`Idempotence non enregistrée : ${(error as Error).message}`);
    }

    return { result, replayed: false };
  }

  async purgeExpired(): Promise<number> {
    const result = await this.keys.delete({ expiresAt: LessThan(new Date()) });
    return result.affected ?? 0;
  }
}
