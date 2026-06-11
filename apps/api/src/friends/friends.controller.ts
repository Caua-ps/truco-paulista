import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';
import { FriendsService } from './friends.service';

class SendRequestDto {
  @IsString()
  username: string;
}

class RespondDto {
  @IsBoolean()
  accept: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.list(user.id);
  }

  @Get('requests')
  requests(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.pendingRequests(user.id);
  }

  @Post('requests')
  send(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendRequestDto) {
    return this.friends.sendRequest(user.id, dto.username);
  }

  @Post('requests/:id/respond')
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondDto,
  ) {
    return this.friends.respond(user.id, id, dto.accept);
  }

  @Delete(':friendId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('friendId') friendId: string) {
    return this.friends.remove(user.id, friendId);
  }

  /** Contadores de mensagens não lidas, por amigo. */
  @Get('messages/unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.friends.unreadCounts(user.id);
  }

  /** Histórico da conversa com um amigo (marca como lidas). */
  @Get(':friendId/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('friendId') friendId: string,
    @Query('before') before?: string,
  ) {
    return this.friends.getMessages(user.id, friendId, before);
  }
}
