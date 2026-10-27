import { SetMetadata } from '@nestjs/common';

export const APPROVED_SELLER_KEY = 'requireApprovedSeller';

export const RequireApprovedSeller = () => SetMetadata(APPROVED_SELLER_KEY, true);
