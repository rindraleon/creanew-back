import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { validateEmail } from '../common/validators/email-disposable.validator';
import { BusinessException } from '../common/errors/business.exception';
import { ErrorCode } from '../common/errors/error-codes';
import type { AuthResponseDto } from './dto/auth.dto';

type Provider = 'google' | 'facebook';
type State = {
  kind: string;
  provider: Provider;
  state: string;
  nonce: string;
  verifier: string;
  registration: boolean;
  username?: string;
};
type Identity = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string;
  verified: boolean;
  avatarUrl: string | null;
};
const STATE_COOKIE = 'creanew_oauth_state';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

@Injectable()
export class OAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  providers(): { google: boolean; facebook: boolean } {
    return { google: this.enabled('google'), facebook: this.enabled('facebook') };
  }

  private enabled(provider: Provider): boolean {
    const prefix = provider === 'google' ? 'GOOGLE' : 'FACEBOOK';
    const flag = String(this.config.get(`OAUTH_${prefix}_ENABLED`) ?? 'false') === 'true';
    const id = this.config.get<string>(
      provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'FACEBOOK_APP_ID',
    );
    const secret = this.config.get<string>(
      provider === 'google' ? 'GOOGLE_CLIENT_SECRET' : 'FACEBOOK_APP_SECRET',
    );
    const appUrl = this.config.get<string>('APP_URL');
    const frontUrl = this.config.get<string>('frontendUrl');
    try {
      const app = new URL(appUrl ?? '');
      const front = new URL(frontUrl ?? '');
      const protocols =
        this.config.get<string>('nodeEnv') === 'production' ? ['https:'] : ['https:', 'http:'];
      return !!(
        flag &&
        id &&
        secret &&
        protocols.includes(app.protocol) &&
        protocols.includes(front.protocol)
      );
    } catch {
      return false;
    }
  }

  private provider(value: string): Provider {
    if ((value !== 'google' && value !== 'facebook') || !this.enabled(value)) {
      throw BusinessException.forbidden('Connexion sociale indisponible.', ErrorCode.FORBIDDEN);
    }
    return value;
  }

  private stateSecret(): string {
    const key = this.config.get<string>('jwt.accessSecret') ?? '';
    return createHmac('sha256', key).update('creanew-oauth-state-v1').digest('hex');
  }

  private callbackUrl(provider: Provider): string {
    const base = (this.config.get<string>('APP_URL') ?? '').replace(/\/$/, '');
    const prefix = (this.config.get<string>('apiPrefix') ?? 'api').replace(/^\/+|\/+$/g, '');
    return `${base}/${prefix ? `${prefix}/` : ''}auth/oauth/${provider}/callback`;
  }

  async start(
    value: string,
    registration: boolean,
    response: Response,
    options: { username?: unknown } = {},
  ): Promise<void> {
    const provider = this.provider(value);
    let username: string | undefined;
    if (registration) {
      if (
        typeof options.username !== 'string' ||
        !/^[a-zA-Z0-9._-]{3,30}$/.test(options.username.trim())
      ) {
        throw BusinessException.badRequest(
          'Nom d’utilisateur invalide.',
          ErrorCode.VALIDATION_ERROR,
        );
      }
      username = options.username.trim().toLowerCase();
    }
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const payload: State = {
      kind: 'oauth-state',
      provider,
      state,
      nonce,
      verifier,
      registration,
      username,
    };
    const signed = this.jwt.sign(payload, {
      secret: this.stateSecret(),
      algorithm: 'HS256',
      expiresIn: '10m',
    });
    response.cookie(STATE_COOKIE, signed, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('nodeEnv') === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });
    const redirect = this.callbackUrl(provider);
    let url: URL;
    if (provider === 'google') {
      url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      url.search = new URLSearchParams({
        client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
    } else {
      url = new URL('https://www.facebook.com/v22.0/dialog/oauth');
      url.search = new URLSearchParams({
        client_id: this.config.get<string>('FACEBOOK_APP_ID') ?? '',
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'email,public_profile',
        state,
      }).toString();
    }
    response.redirect(url.toString());
  }

  /** State signé, limité à 10 minutes et lié au navigateur avant toute utilisation du code. */
  private readState(
    provider: Provider,
    supplied: unknown,
    request: Request,
    response: Response,
  ): State {
    const signed = request.cookies?.[STATE_COOKIE] as string | undefined;
    response.clearCookie(STATE_COOKIE, { path: '/' });
    try {
      if (!signed || typeof supplied !== 'string') throw new Error('state');
      const state = this.jwt.verify<State>(signed, {
        secret: this.stateSecret(),
        algorithms: ['HS256'],
      });
      const a = Buffer.from(state.state);
      const b = Buffer.from(supplied);
      if (
        state.kind !== 'oauth-state' ||
        state.provider !== provider ||
        a.length !== b.length ||
        !timingSafeEqual(a, b)
      )
        throw new Error('state');
      return state;
    } catch {
      throw BusinessException.badRequest(
        'Connexion sociale annulée ou invalide.',
        ErrorCode.VALIDATION_ERROR,
      );
    }
  }

  async complete(value: string, request: Request, response: Response): Promise<AuthResponseDto> {
    const provider = this.provider(value);
    const state = this.readState(provider, request.query.state, request, response);
    if (request.query.error || typeof request.query.code !== 'string' || !request.query.code) {
      throw BusinessException.badRequest('Connexion sociale annulée.', ErrorCode.VALIDATION_ERROR);
    }
    const identity =
      provider === 'google'
        ? await this.googleIdentity(request.query.code, state)
        : await this.facebookIdentity(request.query.code);
    const email = validateEmail(identity.email);
    if (!email.valid)
      throw BusinessException.badRequest(
        'Adresse e-mail sociale refusée.',
        ErrorCode.DISPOSABLE_EMAIL_NOT_ALLOWED,
      );

    const repo = this.dataSource.getRepository(User);
    let user = await repo.findOne({ where: { provider, providerId: identity.id } });
    if (user) {
      // Pas de changement implicite de l'adresse et pas de liaison par simple égalité d'e-mail.
      if (!user.isActive || user.email !== email.normalized)
        throw BusinessException.forbidden('Compte social indisponible.', ErrorCode.FORBIDDEN);
    } else {
      if (!state.registration)
        throw BusinessException.forbidden(
          'Utilisez le parcours d’inscription pour créer un compte.',
          ErrorCode.FORBIDDEN,
        );
      if (await this.users.findByEmail(email.normalized)) {
        throw BusinessException.conflict(
          'Connexion sociale indisponible pour cette adresse. Connectez-vous avec votre méthode habituelle.',
          ErrorCode.CONFLICT,
        );
      }
      // Le nom choisi est validé puis lié au state signé.
      if (!state.username || !/^[a-zA-Z0-9._-]{3,30}$/.test(state.username)) {
        throw BusinessException.badRequest(
          'Nom d’utilisateur invalide.',
          ErrorCode.VALIDATION_ERROR,
        );
      }
      const username = state.username;
      user = await this.users.create({
        username,
        email: email.normalized,
        password: randomBytes(48).toString('base64url'),
        firstName: identity.firstName,
        lastName: identity.lastName || 'Utilisateur',
        provider,
        providerId: identity.id,
        avatarUrl: identity.avatarUrl,
        // Indicateur historique : seul le claim signé de Google établit cette propriété.
        isEmailVerified: provider === 'google' && identity.verified,
      });
    }
    return this.auth.issueOAuthTokens(user, request);
  }

  private async googleIdentity(code: string, state: State): Promise<Identity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
        redirect_uri: this.callbackUrl('google'),
        grant_type: 'authorization_code',
        code_verifier: state.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) throw new Error('Google token exchange failed');
    const body = (await tokenResponse.json()) as { id_token?: unknown };
    if (typeof body.id_token !== 'string') throw new Error('Google ID token missing');
    const { payload } = await jwtVerify(body.id_token, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      algorithms: ['RS256'],
    });
    if (
      payload.nonce !== state.nonce ||
      payload.email_verified !== true ||
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      throw new Error('Google identity verification failed');
    }
    return {
      id: payload.sub,
      email: payload.email,
      firstName: typeof payload.given_name === 'string' ? payload.given_name.slice(0, 120) : null,
      lastName:
        typeof payload.family_name === 'string' ? payload.family_name.slice(0, 120) : 'Utilisateur',
      verified: true,
      avatarUrl:
        typeof payload.picture === 'string' && payload.picture.startsWith('https://')
          ? payload.picture.slice(0, 500)
          : null,
    };
  }

  private async facebookIdentity(code: string): Promise<Identity> {
    const appId = this.config.get<string>('FACEBOOK_APP_ID') ?? '';
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET') ?? '';
    const tokenUrl = new URL('https://graph.facebook.com/v22.0/oauth/access_token');
    tokenUrl.search = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: this.callbackUrl('facebook'),
      code,
    }).toString();
    const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) throw new Error('Facebook token exchange failed');
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== 'string') throw new Error('Facebook token missing');
    const debugUrl = new URL('https://graph.facebook.com/v22.0/debug_token');
    debugUrl.searchParams.set('input_token', token.access_token);
    const debugResponse = await fetch(debugUrl, {
      headers: { Authorization: `Bearer ${appId}|${appSecret}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!debugResponse.ok) throw new Error('Facebook token verification failed');
    const debug = (await debugResponse.json()) as {
      data?: {
        is_valid?: boolean;
        app_id?: string;
        user_id?: string;
        expires_at?: number;
        scopes?: string[];
      };
    };
    if (
      !debug.data?.is_valid ||
      debug.data.app_id !== appId ||
      !debug.data.user_id ||
      !debug.data.expires_at ||
      debug.data.expires_at * 1000 <= Date.now() ||
      !debug.data.scopes?.includes('email')
    ) {
      throw new Error('Facebook token invalid');
    }
    const me = new URL('https://graph.facebook.com/v22.0/me');
    me.searchParams.set('fields', 'id,first_name,last_name,email');
    const profileResponse = await fetch(me, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!profileResponse.ok) throw new Error('Facebook profile unavailable');
    const profile = (await profileResponse.json()) as {
      id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
    };
    if (profile.id !== debug.data.user_id || typeof profile.email !== 'string')
      throw new Error('Facebook identity invalid');
    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.first_name?.slice(0, 120) ?? null,
      lastName: profile.last_name?.slice(0, 120) || 'Utilisateur',
      verified: false,
      avatarUrl: null,
    };
  }
}
