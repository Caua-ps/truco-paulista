-- Snapshot do estado da partida para retomada após restart do servidor
ALTER TABLE "Match"
  ADD COLUMN "stateSnapshot" JSONB,
  ADD COLUMN "roomId" TEXT,
  ADD COLUMN "roomCode" TEXT;

CREATE UNIQUE INDEX "Match_roomId_key" ON "Match"("roomId");
