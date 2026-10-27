import type { Request } from 'express';
import type { Seller } from '../../sellers/entities/seller.entity';
import type { JwtUser } from '../decorators/current-user.decorator';

/** Requête enrichie par les gardes : utilisateur décodé, et boutique si le vendeur est approuvé. */
export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
  seller?: Seller;
}
