import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { GameController } from './game.controller';
import { GamePersistenceService } from './game-persistence.service';
import { GameGateway } from './game.gateway';
import { MatchmakingService } from './matchmaking.service';
import { RoomManagerService } from './room-manager.service';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [GameController],
  providers: [GameGateway, RoomManagerService, MatchmakingService, GamePersistenceService],
})
export class GameModule {}
