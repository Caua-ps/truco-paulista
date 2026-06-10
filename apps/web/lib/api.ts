'use client';

import { useAuth } from './auth-store';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Fetch autenticado com refresh automático: em 401, tenta renovar o par de
 * tokens uma vez e repete a requisição.
 */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, ...init } = options;
  const doFetch = async (): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    const token = useAuth.getState().accessToken;
    if (auth && token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && useAuth.getState().refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? message);
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = useAuth.getState().refreshToken;
      if (!refreshToken) return false;
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        useAuth.getState().clear();
        return false;
      }
      const tokens = await res.json();
      useAuth.getState().setSession(tokens);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}
