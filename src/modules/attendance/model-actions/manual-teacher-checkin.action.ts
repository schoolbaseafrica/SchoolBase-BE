import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TeacherManualCheckin } from '../entities';

@Injectable()
export class TeacherManualCheckinModelAction extends AbstractModelAction<TeacherManualCheckin> {
  constructor(
    @InjectRepository(TeacherManualCheckin)
    teacherManualCheckinRepository: Repository<TeacherManualCheckin>,
  ) {
    super(teacherManualCheckinRepository, TeacherManualCheckin);
  }
}
