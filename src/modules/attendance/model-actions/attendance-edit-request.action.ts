import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AttendanceEditRequest } from '../entities/student-daily-attendance.entity';

@Injectable()
export class AttendanceEditRequestModelAction extends AbstractModelAction<AttendanceEditRequest> {
  constructor(
    @InjectRepository(AttendanceEditRequest)
    editRequestRepository: Repository<AttendanceEditRequest>,
  ) {
    super(editRequestRepository, AttendanceEditRequest);
  }
}
