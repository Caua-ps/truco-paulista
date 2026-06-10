import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamePersistenceService } from './game-persistence.service';
import { GameGateway } from './game.gateway';
import { MatchmakingService } from './matchmaking.service';
import { RoomManagerService } from './room-manager.service';

@Module({
  imports: [AuthModule],
  providers: [GameGateway, RoomManagerService, MatchmakingService, GamePersistenceService],
})
export class GameModule {}
