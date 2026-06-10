import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, username: true, displayName: true, avatarUrl: true, level: true } },
        addressee: { select: { id: true, username: true, displayName: true, avatarUrl: true, level: true } },
      },
    });
    return Promise.all(
      friendships.map(async (f) => {
        const friend = f.requesterId === userId ? f.addressee : f.requester;
        return { ...friend, online: await this.redis.isOnline(friend.id) };
      }),
    );
  }

  async pendingRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'PENDING' },
      include: {
        requester: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async sendRequest(userId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) throw new NotFoundException('Jogador não encontrado');
    if (target.id === userId) throw new BadRequestException('Você não pode adicionar a si mesmo');

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'BLOCKED') throw new BadRequestException('Não foi possível enviar o convite');
      if (existing.status === 'ACCEPTED') throw new BadRequestException('Vocês já são amigos');
      // Convite cruzado: aceita automaticamente.
      if (existing.requesterId === target.id) {
        return this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED' },
        });
      }
      throw new BadRequestException('Convite já enviado');
    }

    return this.prisma.friendship.create({
      data: { requesterId: userId, addresseeId: target.id },
    });
  }

  async respond(userId: string, friendshipId: string, accept: boolean) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship || friendship.addresseeId !== userId || friendship.status !== 'PENDING') {
      throw new NotFoundException('Convite não encontrado');
    }
    if (accept) {
      return this.prisma.friendship.update({
        where: { id: friendshipId },
        data: { status: 'ACCEPTED' },
      });
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  async remove(userId: string, friendUserId: string) {
    await this.prisma.friendship.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: friendUserId },
          { requesterId: friendUserId, addresseeId: userId },
        ],
      },
    });
    return { ok: true };
  }
}
