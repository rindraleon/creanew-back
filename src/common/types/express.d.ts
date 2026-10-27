import type { JwtUser } from '../decorators/current-user.decorator';
import type { Seller } from '../../sellers/entities/seller.entity';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtUser;
      /** Vendeur résolu par SellerApprovedGuard (jamais fourni par le client). */
      seller?: Seller;
      id?: string;
    }
  }
}

export {};
