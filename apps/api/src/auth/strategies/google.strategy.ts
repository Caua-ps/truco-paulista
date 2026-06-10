import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { GoogleProfile } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      // Valores dummy permitem subir a aplicação sem OAuth configurado;
      // a rota /auth/google só funciona com credenciais reais no .env.
      clientID: process.env.GOOGLE_CLIENT_ID || 'unset',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'unset',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Conta Google sem e-mail público');
    }
    return {
      googleId: profile.id,
      email,
      displayName: profile.displayName ?? email.split('@')[0] ?? 'Jogador',
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
