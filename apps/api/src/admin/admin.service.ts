import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, matchesToday, openReports, activeMatches] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.match.count({
        where: { startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.match.count({ where: { status: 'IN_PROGRESS' } }),
    ]);
    return { users, matchesToday, openReports, activeMatches };
  }

  listUsers(search?: string, page = 1, pageSize = 25) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        level: true,
        rating: true,
        bannedUntil: true,
        banReason: true,
        createdAt: true,
      },
    });
  }

  async banUser(adminId: string, userId: string, days: number, reason: string) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { bannedUntil: until, banReason: reason },
      }),
      // Derruba todas as sessões do usuário banido.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.adminAuditLog.create({
        data: { adminId, action: 'BAN_USER', targetRef: userId, details: { days, reason } },
      }),
    ]);
    return { ok: true, bannedUntil: until };
  }

  async unbanUser(adminId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { bannedUntil: null, banReason: null },
      }),
      this.prisma.adminAuditLog.create({
        data: { adminId, action: 'UNBAN_USER', targetRef: userId },
      }),
    ]);
    return { ok: true };
  }

  listMatches(status?: 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED', page = 1) {
    return this.prisma.match.findMany({
      where: status ? { status } : {},
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * 25,
      take: 25,
      include: {
        players: { select: { seat: true, team: true, user: { select: { username: true } } } },
      },
    });
  }

  listReports(status?: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED') {
    return this.prisma.report.findMany({
      where: status ? { status } : { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        reporter: { select: { username: true } },
        target: { select: { username: true } },
      },
    });
  }

  async resolveReport(adminId: string, reportId: string, dismiss: boolean) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Denúncia não encontrada');
    await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: reportId },
        data: { status: dismiss ? 'DISMISSED' : 'RESOLVED', resolvedAt: new Date() },
      }),
      this.prisma.adminAuditLog.create({
        data: { adminId, action: dismiss ? 'DISMISS_REPORT' : 'RESOLVE_REPORT', targetRef: reportId },
      }),
    ]);
    return { ok: true };
  }

  async hideChatMessage(adminId: string, messageId: string) {
    await this.prisma.$transaction([
      this.prisma.chatMessage.update({ where: { id: messageId }, data: { hidden: true } }),
      this.prisma.adminAuditLog.create({
        data: { adminId, action: 'HIDE_CHAT_MESSAGE', targetRef: messageId },
      }),
    ]);
    return { ok: true };
  }

  auditLogs(page = 1) {
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * 50,
      take: 50,
      include: { admin: { select: { username: true } } },
    });
  }
}
