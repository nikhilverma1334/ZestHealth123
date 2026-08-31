import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    let user = (request as any).user;
    
    // Fallback logic if a global JwtAuthGuard wasn't applied, we decode for the scope of this guard
    if (!user) {
      let token = request.headers['authorization']?.split(' ')[1];
      if (!token && request.cookies) {
        token = request.cookies['jwt_token'];
      }
      
      if (token) {
        try {
          const jwt = require('jsonwebtoken');
          user = jwt.verify(token, 'ZestHealthSuperSecretKey_DoNotUseInProd');
          (request as any).user = user;
        } catch (e) {
          throw new UnauthorizedException('Invalid token');
        }
      }
    }

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    const headerTenantId = request.headers['x-tenant-id'] as string;

    if (user.role === 'PLATFORM_SUPER_ADMIN') {
      if (!headerTenantId) {
        throw new ForbiddenException('Super admins must provide x-tenant-id');
      }
      (request as any).tenantId = headerTenantId;
    } else if (user.roles && Array.isArray(user.roles)) {
      if (!headerTenantId) {
        throw new ForbiddenException('tenant context required');
      }
      const hasAccess = user.roles.some((r: any) => r.tenantId === headerTenantId);
      if (!hasAccess) {
        throw new ForbiddenException('Staff does not have access to this tenant');
      }
      (request as any).tenantId = headerTenantId;
    } else if (user.role === 'PATIENT') {
       (request as any).tenantId = headerTenantId;
    } else {
      throw new ForbiddenException('Could not resolve tenant for user');
    }

    return true;
  }
}
