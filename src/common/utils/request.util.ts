import { UnauthorizedException } from '@nestjs/common';
import type { JwtUser } from '../decorators/current-user.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/** Le garde JWT pose `user` ; on lève explicitement si la requête n'est pas passée par lui. */
export function requireUser(request: AuthenticatedRequest): JwtUser {
  const user = request.user;
  if (!user) throw new UnauthorizedException('Authentification requise.');
  return user;
}
