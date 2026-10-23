import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { StudentPhotoCaptureService } from '../services/student-photo-capture.service';

@Injectable()
export class PhotoCaptureTokenGuard implements CanActivate {
  constructor(private readonly photos: StudentPhotoCaptureService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    await this.photos.validateToken(request.headers['x-capture-token']);
    return true;
  }
}
