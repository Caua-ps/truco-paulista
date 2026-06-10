import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  // -------------------------------------------------------------------------
  // Cadastro e login tradicionais
  // -------------------------------------------------------------------------

  async register(input: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === input.email ? 'E-mail já cadastrado' : 'Nome de usuário já em uso',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        displayName: input.displayName ?? input.username,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
    });

    await this.issueEmailVerification(user.id, user.email);
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  async login(identifier: string, password: string): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
    // bcrypt.compare em hash dummy mantém o tempo de resposta constante
    // (evita enumeração de contas por timing).
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalid1234567890';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    this.assertNotBanned(user);
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  // -------------------------------------------------------------------------
  // Google OAuth
  // -------------------------------------------------------------------------

  async loginWithGoogle(profile: GoogleProfile): Promise<{ user: PublicUser; tokens: TokenPair }> {
    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });

    if (!user) {
      // Vincula à conta existente com o mesmo e-mail, se houver.
      const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: profile.googleId, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            googleId: profile.googleId,
            email: profile.email,
            username: await this.uniqueUsernameFrom(profile.email),
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            emailVerifiedAt: new Date(), // e-mail já verificado pelo Google
          },
        });
      }
    }

    this.assertNotBanned(user);
    const tokens = await this.issueTokens(user);
    return { user: toPublicUser(user), tokens };
  }

  // -------------------------------------------------------------------------
  // Refresh / logout
  // -------------------------------------------------------------------------

  async refresh(refreshToken: string): Promise<TokenPair> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão expirada, faça login novamente');
    }
    // Rotação: o token usado é revogado e um novo par é emitido.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user);
  }

  async logout(userId: string, refreshToken: string, allDevices = false): Promise<void> {
    if (allDevices) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Verificação de e-mail e recuperação de senha
  // -------------------------------------------------------------------------

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeAuthToken(token, 'EMAIL_VERIFICATION');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) throw new BadRequestException('E-mail já verificado');
    await this.issueEmailVerification(user.id, user.email);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Resposta idêntica para e-mail existente ou não (evita enumeração).
    if (!user) return;
    const token = randomBytes(32).toString('hex');
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      },
    });
    await this.mail.sendPasswordReset(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.consumeAuthToken(token, 'PASSWORD_RESET');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    // Troca de senha derruba todas as sessões ativas.
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const days = Number(process.env.JWT_REFRESH_EXPIRES_IN?.replace(/\D/g, '') || 30);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async issueEmailVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    await this.prisma.authToken.create({
      data: {
        userId,
        type: 'EMAIL_VERIFICATION',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });
    await this.mail.sendEmailVerification(email, token);
  }

  private async consumeAuthToken(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado');
    }
    await this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return record;
  }

  private assertNotBanned(user: User): void {
    if (user.bannedUntil && user.bannedUntil > new Date()) {
      throw new UnauthorizedException(`Conta suspensa até ${user.bannedUntil.toISOString()}`);
    }
  }

  private async uniqueUsernameFrom(email: string): Promise<string> {
    const base = (email.split('@')[0] ?? 'jogador').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'jogador';
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}${Math.floor(Math.random() * 10000)}`;
      const exists = await this.prisma.user.findUnique({ where: { username: candidate } });
      if (!exists) return candidate;
    }
    return `jogador_${randomBytes(4).toString('hex')}`;
  }
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  xp: number;
  level: number;
  rating: number;
  emailVerified: boolean;
  isPremium: boolean;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    xp: user.xp,
    level: user.level,
    rating: user.rating,
    emailVerified: user.emailVerifiedAt !== null,
    isPremium: user.premiumLifetime || (user.premiumUntil !== null && user.premiumUntil > new Date()),
  };
}
