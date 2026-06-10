import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { AdminService } from './admin.service';
import { Roles, RolesGuard } from './roles.guard';

class BanDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;

  @IsString()
  @MaxLength(200)
  reason: string;
}

class ResolveReportDto {
  @IsBoolean()
  dismiss: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MODERATOR')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users(@Query('search') search?: string, @Query('page') page?: string) {
    return this.admin.listUsers(search, Math.max(1, Number(page) || 1));
  }

  @Roles('ADMIN')
  @Post('users/:id/ban')
  ban(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: BanDto) {
    return this.admin.banUser(admin.id, id, dto.days, dto.reason);
  }

  @Roles('ADMIN')
  @Post('users/:id/unban')
  unban(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.admin.unbanUser(admin.id, id);
  }

  @Get('matches')
  matches(@Query('status') status?: 'IN_PROGRESS' | 'FINISHED' | 'ABANDONED', @Query('page') page?: string) {
    return this.admin.listMatches(status, Math.max(1, Number(page) || 1));
  }

  @Get('reports')
  reports(@Query('status') status?: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED') {
    return this.admin.listReports(status);
  }

  @Post('reports/:id/resolve')
  resolveReport(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.admin.resolveReport(admin.id, id, dto.dismiss);
  }

  @Post('chat/:messageId/hide')
  hideMessage(@CurrentUser() admin: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.admin.hideChatMessage(admin.id, messageId);
  }

  @Roles('ADMIN')
  @Get('audit-logs')
  auditLogs(@Query('page') page?: string) {
    return this.admin.auditLogs(Math.max(1, Number(page) || 1));
  }
}
