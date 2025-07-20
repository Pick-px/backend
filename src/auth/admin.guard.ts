import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // JwtAuthGuard에서 user를 세팅해줘야 함
    const user = request.user as any;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }
    return true;
  }
} 