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

  // ---------------------------------------------------------------------------
  // Mensagens diretas (chat entre amigos)
  // ---------------------------------------------------------------------------

  async areFriends(a: string, b: string): Promise<boolean> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      select: { id: true },
    });
    return friendship !== null;
  }

  private async assertFriends(a: string, b: string): Promise<void> {
    if (!(await this.areFriends(a, b))) {
      throw new BadRequestException('Vocês não são amigos');
    }
  }

  /**
   * Histórico da conversa (mais recentes primeiro, paginação por cursor).
   * Marca como lidas as mensagens recebidas do amigo.
   */
  async getMessages(userId: string, friendId: string, before?: string) {
    await this.assertFriends(userId, friendId);
    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: friendId },
          { senderId: friendId, recipientId: userId },
        ],
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    await this.prisma.directMessage.updateMany({
      where: { senderId: friendId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return messages.reverse().map((m) => ({
      id: m.id,
      fromUserId: m.senderId,
      text: m.content,
      at: m.createdAt.getTime(),
    }));
  }

  /** Persiste uma DM (validação de amizade inclusa). */
  async saveDirectMessage(senderId: string, recipientId: string, content: string) {
    await this.assertFriends(senderId, recipientId);
    const msg = await this.prisma.directMessage.create({
      data: { senderId, recipientId, content },
    });
    return {
      id: msg.id,
      fromUserId: msg.senderId,
      toUserId: msg.recipientId,
      text: msg.content,
      at: msg.createdAt.getTime(),
    };
  }

  /** Não-lidas por amigo (para badges). */
  async unreadCounts(userId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.directMessage.groupBy({
      by: ['senderId'],
      where: { recipientId: userId, readAt: null },
      _count: { id: true },
    });
    return Object.fromEntries(rows.map((r) => [r.senderId, r._count.id]));
  }
}
