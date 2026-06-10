import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getMe(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/history')
  history(@CurrentUser() user: AuthenticatedUser, @Query('page') page?: string) {
    return this.users.matchHistory(user.id, Math.max(1, Number(page) || 1));
  }

  @UseGuards(JwtAuthGuard)
  @Get('matches/:id/replay')
  replay(@Param('id') id: string) {
    return this.users.matchReplay(id);
  }

  /** Perfil público de qualquer jogador. */
  @Get(':username')
  profile(@Param('username') username: string) {
    return this.users.getPublicProfile(username);
  }
}
