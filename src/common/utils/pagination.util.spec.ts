import { paginate } from './pagination.util';
import { SortOrder } from '../dto/pagination-query.dto';
import { buildMeta } from '../interfaces/paginated.interface';
import type { SelectQueryBuilder } from 'typeorm';

const fakeQb = (total: number) => {
  const qb: Record<string, jest.Mock> = {
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue([[{ id: '1' }], total]),
  };
  return qb;
};

describe('paginate()', () => {
  it('applique page/limit et retourne { items, meta }', async () => {
    const qb = fakeQb(45);

    const result = await paginate(qb as unknown as SelectQueryBuilder<never>, {
      alias: 'product',
      query: { page: 3, limit: 10, order: SortOrder.DESC },
    });

    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 45,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('préfixe le champ de tri par l’alias (jamais de nom SQL brut)', async () => {
    const qb = fakeQb(1);

    await paginate(qb as unknown as SelectQueryBuilder<never>, {
      alias: 'order',
      query: { order: SortOrder.ASC, page: 1, limit: 20 },
      defaultSort: 'createdAt',
    });

    expect(qb.orderBy).toHaveBeenCalledWith('order.createdAt', 'ASC');
  });

  it('borne limit à 100 même si le client demande plus', async () => {
    const qb = fakeQb(1);
    await paginate(qb as unknown as SelectQueryBuilder<never>, {
      alias: 'p',
      query: { limit: 5000, page: 1, order: SortOrder.DESC },
    });
    expect(qb.take).toHaveBeenCalledWith(100);
  });

  it('borne page au minimum 1', async () => {
    const qb = fakeQb(1);
    await paginate(qb as unknown as SelectQueryBuilder<never>, {
      alias: 'p',
      query: { page: -5, limit: 20, order: SortOrder.DESC },
    });
    expect(qb.skip).toHaveBeenCalledWith(0);
  });
});

describe('buildMeta()', () => {
  it('calcule totalPages et les indicateurs de navigation', () => {
    expect(buildMeta(0, 1, 20)).toMatchObject({ totalPages: 0, hasNextPage: false });
    expect(buildMeta(20, 1, 20)).toMatchObject({ totalPages: 1, hasNextPage: false });
    expect(buildMeta(21, 1, 20)).toMatchObject({ totalPages: 2, hasNextPage: true });
  });
});
