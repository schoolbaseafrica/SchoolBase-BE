import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccountCreationService } from './account-creation.service';
import { EmailService } from './email.service';

@Module({
  imports: [ConfigModule],
  providers: [EmailService, AccountCreationService],
  exports: [EmailService, AccountCreationService],
})
export class EmailModule {}
