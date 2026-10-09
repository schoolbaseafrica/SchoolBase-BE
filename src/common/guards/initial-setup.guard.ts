import { createHash, timingSafeEqual } from 'crypto';

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InitialSetupGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configured = this.config.get<string>('initialSetup.secret');
    if (!configured || Buffer.byteLength(configured) < 32) {
      throw new NotFoundException('Initial setup is unavailable');
    }

    const supplied = context.switchToHttp().getRequest().headers[
      'x-initial-setup-secret'
    ];
    if (typeof supplied !== 'string') {
      throw new ForbiddenException('Invalid initial setup secret');
    }

    const expectedHash = createHash('sha256').update(configured).digest();
    const suppliedHash = createHash('sha256').update(supplied).digest();
    if (!timingSafeEqual(expectedHash, suppliedHash)) {
      throw new ForbiddenException('Invalid initial setup secret');
    }
    return true;
  }
}
