import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

import { AcademicSessionModelAction } from '../../academic-session/model-actions/academic-session-actions';
import { TermModelAction } from '../../academic-term/model-actions';
import { ClassSubjectModelAction } from '../../class/model-actions/class-subject.action';
import { ClassModelAction } from '../../class/model-actions/class.actions';
import { ResultModelAction } from '../../result/model-actions';
import { StudentModelAction } from '../../student/model-actions/student-actions';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { ResultEventDto } from '../dto/event-trigger.dto';
import { NotificationType } from '../types/notification.types';

import { NotificationService } from './notification.service';
@Injectable()
export class ResultNotificationService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly notificationService: NotificationService,
    private readonly resultModelAction: ResultModelAction,
    private readonly studentModelAction: StudentModelAction,
    private readonly classModelAction: ClassModelAction,
    private readonly classSubjectModelAction: ClassSubjectModelAction,
    private readonly termModelAction: TermModelAction,
    private readonly academicSessionModelAction: AcademicSessionModelAction,
  ) {
    this.logger = baseLogger.child({
      context: ResultNotificationService.name,
    });
  }

  async handleResultPublication(event: ResultEventDto): Promise<void> {
    try {
      if (!event.is_published) {
        this.logger.info('Result not published, skipping notification', {
          result_id: event.result_id,
        });
        return;
      }

      const result = await this.resultModelAction.get({
        identifierOptions: { id: event.result_id },
        relations: {
          student: { user: true, parent: { user: true } },
          class: true,
          term: true,
          academicSession: true,
          subject_lines: { subject: true },
        },
      });

      if (!result) {
        this.logger.warn('Result not found', { result_id: event.result_id });
        return;
      }

      const { student, class: classEntity, term, academicSession } = result;

      if (!student) {
        this.logger.warn('Student not found', {
          student_id: event.student_id,
        });
        return;
      }

      const class_subjects = await this.classSubjectModelAction.list({
        filterRecordOptions: { class: { id: event.class_id } },
        relations: { teacher: { user: true }, subject: true },
      });

      const metadata = {
        result_id: event.result_id,
        student_id: event.student_id,
        subject_id: event.subject_id || null,
        deep_link: `/results/${event.result_id}`,
      };

      const class_name = classEntity?.name || 'your class';
      const term_name = term?.name || 'this term';
      const session_name = academicSession?.name || 'this session';
      const student_name = student.user?.first_name || 'Student';

      const notifications: CreateNotificationDto[] = [];

      notifications.push({
        recipient_id: student.user.id,
        title: 'Your Result is Available',
        message: `Your result for ${class_name}, ${term_name} (${session_name}) has been published!`,
        type: NotificationType.RESULT_ALERT,
        metadata,
      });

      if (student.parent?.user?.id) {
        notifications.push({
          recipient_id: student.parent.user.id,
          title: `${student_name}'s Result is Available`,
          message: `${student_name}'s result for ${class_name}, ${term_name} (${session_name}) has been published.`,
          type: NotificationType.RESULT_ALERT,
          metadata,
        });
      } else {
        this.logger.info('Student has no linked parent', {
          student_id: event.student_id,
        });
      }

      const teacher_user_ids = new Set<string>();

      for (const class_subject of class_subjects.payload) {
        if (class_subject.teacher?.user?.id) {
          teacher_user_ids.add(class_subject.teacher.user.id);
        }
      }

      for (const teacher_user_id of teacher_user_ids) {
        notifications.push({
          recipient_id: teacher_user_id,
          title: 'Student Result Published',
          message: `${student_name}'s result for ${class_name}, ${term_name} (${session_name}) has been published.`,
          type: NotificationType.RESULT_ALERT,
          metadata,
        });
      }

      if (notifications.length > 0) {
        await this.notificationService.createBulkNotifications(notifications);
        this.logger.info('Result publication notifications sent', {
          result_id: event.result_id,
          notification_count: notifications.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to send result publication notifications', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        event,
      });
    }
  }
}
