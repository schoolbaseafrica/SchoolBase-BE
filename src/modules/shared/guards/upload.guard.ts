import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class UploadGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    // Check for upload key
    const uploadKey = request.headers['x-upload-key'];

    const validUploadKey = this.configService.get<string>('upload.key');

    // If valid upload key provided, allow access
    if (uploadKey && validUploadKey && uploadKey === validUploadKey) {
      return true;
    }

    // fall back to JWT auth
    return super.canActivate(context);
  }
}
