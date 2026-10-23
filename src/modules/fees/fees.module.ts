import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicSessionModule } from '../academic-session/academic-session.module';
import { Term } from '../academic-term/entities/term.entity';
import { TermModelAction } from '../academic-term/model-actions';
import { TermModule } from '../academic-term/term.module';
import { Class } from '../class/entities/class.entity';
import { ClassModelAction } from '../class/model-actions/class.actions';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { StudentModule } from '../student/student.module';

import { FeeAssignment } from './entities/fee-assignment.entity';
import { Fees } from './entities/fees.entity';
import { FeeDiscountController } from './fee-discount.controller';
import { FeeDiscountService } from './fee-discount.service';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { FeesModelAction } from './model-action/fees.model-action';

@Module({
  imports: [
    AcademicSessionModule,
    TermModule,
    TypeOrmModule.forFeature([Fees, Class, Term, FeeAssignment]),
    forwardRef(() => NotificationModule),
    forwardRef(() => PaymentModule),
    StudentModule,
  ],
  controllers: [FeesController, FeeDiscountController],
  providers: [
    FeesService,
    FeeDiscountService,
    FeesModelAction,
    TermModelAction,
    ClassModelAction,
  ],
  exports: [
    FeesService,
    FeeDiscountService,
    FeesModelAction,
    TermModelAction,
    ClassModelAction,
    TypeOrmModule,
  ],
})
export class FeesModule {}
