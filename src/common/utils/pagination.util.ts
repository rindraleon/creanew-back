import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { PaginationQueryDto } from '../dto/pagination-query.dto';
import { SortOrder } from '../dto/pagination-query.dto';
import { buildMeta, type Paginated } from '../interfaces/paginated.interface';

export interface PaginateOptions {
  alias: string;
  query: PaginationQueryDto;
  /** Champ de tri par défaut (préfixé par l'alias). */
  defaultSort?: string;
}

/** Exécute une requête paginée et retourne { items, meta }. */
export async function paginate<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: PaginateOptions,
): Promise<Paginated<T>> {
  const { query, defaultSort = 'createdAt' } = options;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const sortField = defaultSort.includes('.') ? defaultSort : `${options.alias}.${defaultSort}`;

  qb.skip((page - 1) * limit).take(limit);
  qb.orderBy(sortField, query.order ?? SortOrder.DESC);

  const [items, total] = await qb.getManyAndCount();
  return { items, meta: buildMeta(total, page, limit) };
}
