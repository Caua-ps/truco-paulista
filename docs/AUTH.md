# Fluxo de autenticação

## Cadastro tradicional

```
POST /auth/register { username, email, password }
  → cria usuário (bcrypt 12)
  → gera token de verificação (24h, hash no banco)
  → envia e-mail com link /verificar-email?token=...
  → retorna { user, tokens: { accessToken (JWT 15min), refreshToken (opaco 30d) } }
```

O usuário pode jogar antes de verificar o e-mail; recursos sensíveis podem
exigir `emailVerifiedAt` no futuro.

## Login

```
POST /auth/login { identifier (username|email), password }
  → valida bcrypt (tempo constante) + checa banimento
  → retorna { user, tokens }
```

## Google OAuth

```
GET /auth/google           → redirect para consentimento Google
GET /auth/google/callback  → passport valida o profile
  → vincula por googleId; se e-mail já existe, conecta as contas
  → conta nova: username único derivado do e-mail, e-mail já verificado
  → redirect: WEB_ORIGIN/auth/callback#accessToken=...&refreshToken=...
     (fragment não trafega para servidores nem fica em logs)
```

## Sessões e renovação

- `POST /auth/refresh { refreshToken }` — rotação: o token usado é revogado e
  um novo par é emitido. Reuso de token revogado = 401 (possível roubo).
- `POST /auth/logout { refreshToken, allDevices? }` — revoga a sessão (ou todas).
- O cliente web renova automaticamente em qualquer 401 (single-flight) e
  desloga se o refresh falhar.

## Recuperação de senha

```
POST /auth/forgot-password { email }   → resposta idêntica sempre (anti-enumeração)
e-mail com link → /redefinir-senha?token=...
POST /auth/reset-password { token, password }
  → troca a senha e revoga TODAS as sessões ativas
```

## WebSocket

O handshake do Socket.IO envia `auth: { token: accessToken }`. O gateway
verifica o JWT; sem token válido o socket é desconectado. Na reconexão o
servidor reassocia o usuário à sala/partida ativa e reenvia o estado.
