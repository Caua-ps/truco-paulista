import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../common/current-user.decorator';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: AuthenticatedUser['role'][]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthenticatedUser['role'][] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return user !== undefined && required.includes(user.role);
  }
}
