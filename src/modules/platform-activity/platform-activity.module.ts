import { Module } from '@nestjs/common';

import { PlatformActivityService } from './platform-activity.service';

@Module({ providers: [PlatformActivityService] })
export class PlatformActivityModule {}
