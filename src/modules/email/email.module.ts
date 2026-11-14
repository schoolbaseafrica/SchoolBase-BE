import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { School } from '../school/entities/school.entity';

import { AccountCreationService } from './account-creation.service';
import { EmailService } from './email.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([School])],
  providers: [EmailService, AccountCreationService],
  exports: [EmailService, AccountCreationService],
})
export class EmailModule {}
