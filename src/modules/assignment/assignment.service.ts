import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { AcademicSession } from '../academic-session/entities/academic-session.entity';
import { Term } from '../academic-term/entities/term.entity';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassSubject } from '../class/entities/class-subject.entity';
import { Class } from '../class/entities/class.entity';
import { Notification } from '../notification/entities/notification.entity';
import { NotificationType } from '../notification/types/notification.types';
import { Student } from '../student/entities/student.entity';
import { Subject } from '../subject/entities/subject.entity';
import { Teacher } from '../teacher/entities/teacher.entity';
import { Schedule } from '../timetable/entities/schedule.entity';
import { MinioService } from '../upload/services/minio.service';

import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  SaveSubmissionDto,
  UpdateAssignmentDto,
} from './assignment.dto';
import { AssignmentAttachment } from './entities/assignment-attachment.entity';
import {
  AssignmentReminder,
  AssignmentReminderType,
} from './entities/assignment-reminder.entity';
import {
  Assignment,
  AssignmentStatus,
  AssignmentSubmission,
  AssignmentSubmissionStatus,
} from './entities/assignment.entity';

const relations = {
  classroom: true,
  subject: true,
  teacher: { user: true },
  academicSession: true,
  academicTerm: true,
  submissions: { student: { user: true } },
} as const;

@Injectable()
export class AssignmentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssignmentService.name);
  private reminderTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissions: Repository<AssignmentSubmission>,
    @InjectRepository(Teacher) private readonly teachers: Repository<Teacher>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(Class) private readonly classes: Repository<Class>,
    @InjectRepository(ClassStudent)
    private readonly classStudents: Repository<ClassStudent>,
    @InjectRepository(ClassSubject)
    private readonly classSubjects: Repository<ClassSubject>,
    @InjectRepository(Subject) private readonly subjects: Repository<Subject>,
    @InjectRepository(AcademicSession)
    private readonly sessions: Repository<AcademicSession>,
    @InjectRepository(Term) private readonly terms: Repository<Term>,
    @InjectRepository(Schedule)
    private readonly schedules: Repository<Schedule>,
    @InjectRepository(AssignmentAttachment)
    private readonly attachments: Repository<AssignmentAttachment>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(AssignmentReminder)
    private readonly reminders: Repository<AssignmentReminder>,
    private readonly minio: MinioService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.reminderTimer = setInterval(
      () =>
        void this.processReminders().catch((error) => this.logger.error(error)),
      15 * 60 * 1000,
    );
    this.reminderTimer.unref();
    setTimeout(
      () =>
        void this.processReminders().catch((error) => this.logger.error(error)),
      15_000,
    ).unref();
  }

  onModuleDestroy() {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
  }

  private createNotification(
    recipientId: string,
    title: string,
    message: string,
    metadata: Record<string, string>,
  ) {
    return this.notifications.save(
      this.notifications.create({
        recipient_id: recipientId,
        title,
        message,
        type: NotificationType.ASSIGNMENT,
        metadata,
        is_read: false,
      }),
    );
  }

  private isAdmin(roles: string[]) {
    return roles.includes('admin');
  }

  private async teacherFor(userId: string) {
    const teacher = await this.teachers.findOne({ where: { user_id: userId } });
    if (!teacher) throw new ForbiddenException('Teacher profile not found');
    return teacher;
  }

  private async studentFor(userId: string) {
    const student = await this.students.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });
    if (!student) throw new ForbiddenException('Student profile not found');
    return student;
  }

  private async studentForParent(studentId: string, parentUserId: string) {
    const student = await this.students.findOne({
      where: {
        id: studentId,
        is_deleted: false,
        parent: { user_id: parentUserId, is_active: true },
      },
      relations: { user: true, parent: { user: true } },
    });
    if (!student)
      throw new ForbiddenException(
        'This student is not linked to your account',
      );
    return student;
  }

  private async assertTeacherAccess(
    assignment: Assignment,
    userId: string,
    roles: string[],
  ) {
    if (this.isAdmin(roles)) return;
    const teacher = await this.teacherFor(userId);
    if (assignment.teacher.id !== teacher.id)
      throw new ForbiddenException('You do not manage this assignment');
  }

  async teacherSubjects(classId: string, userId: string) {
    const teacher = await this.teacherFor(userId);
    const [classSubjects, schedules] = await Promise.all([
      this.classSubjects.find({
        where: { class: { id: classId }, teacher: { id: teacher.id } },
        relations: { subject: true },
      }),
      this.schedules
        .createQueryBuilder('schedule')
        .innerJoin('schedule.timetable', 'timetable')
        .innerJoinAndSelect('schedule.subject', 'subject')
        .where('timetable.class_id = :classId', { classId })
        .andWhere('timetable.is_active = true')
        .andWhere('schedule.teacher_id = :teacherId', {
          teacherId: teacher.id,
        })
        .getMany(),
    ]);
    const subjects = new Map<string, Subject>();
    classSubjects.forEach((item) =>
      subjects.set(item.subject.id, item.subject),
    );
    schedules.forEach((item) => {
      if (item.subject) subjects.set(item.subject.id, item.subject);
    });
    return [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async uploadAttachment(
    assignmentId: string,
    file: IMulterFile,
    userId: string,
    roles: string[],
  ) {
    const assignment = await this.get(assignmentId, userId, roles);
    let student: Student | null = null;
    if (roles.includes('student')) {
      if (assignment.status !== AssignmentStatus.PUBLISHED)
        throw new BadRequestException(
          'This assignment is not accepting attachments',
        );
      student = await this.studentFor(userId);
      const graded = await this.submissions.exists({
        where: {
          assignment: { id: assignmentId },
          student: { id: student.id },
          status: AssignmentSubmissionStatus.GRADED,
        },
      });
      if (graded)
        throw new BadRequestException(
          'A graded submission cannot receive new attachments',
        );
    } else if (assignment.status !== AssignmentStatus.DRAFT) {
      throw new BadRequestException(
        'Teacher resources can only be changed while the assignment is a draft',
      );
    }
    const uploaded = await this.minio.uploadFile(
      file,
      `assignments/${assignmentId}/${student?.id ?? 'teacher'}`,
    );
    try {
      return await this.attachments.save(
        this.attachments.create({
          assignment,
          student,
          objectKey: uploaded.publicId,
          originalName: file.originalname.slice(0, 255),
          mimeType: file.mimetype,
          size: file.size,
          uploadedBy: userId,
        }),
      );
    } catch (error) {
      await this.minio.deleteImage(uploaded.publicId).catch(() => undefined);
      throw error;
    }
  }

  async listAttachments(
    assignmentId: string,
    userId: string,
    roles: string[],
    parentStudentId?: string,
  ) {
    let visibleStudent: Student | null = null;
    if (roles.includes('parent')) {
      if (!parentStudentId)
        throw new BadRequestException('A linked student is required');
      visibleStudent = await this.studentForParent(parentStudentId, userId);
      await this.assertStudentAssignmentAccess(assignmentId, visibleStudent.id);
    } else {
      await this.get(assignmentId, userId, roles);
    }
    const rows = await this.attachments.find({
      where: { assignment: { id: assignmentId } },
      relations: { student: { user: true } },
      order: { createdAt: 'ASC' },
    });
    if (!roles.includes('student') && !roles.includes('parent')) return rows;
    const student = visibleStudent ?? (await this.studentFor(userId));
    return rows.filter(
      (item) => !item.student || item.student.id === student.id,
    );
  }

  async downloadAttachment(
    assignmentId: string,
    attachmentId: string,
    userId: string,
    roles: string[],
    parentStudentId?: string,
  ) {
    const allowed = await this.listAttachments(
      assignmentId,
      userId,
      roles,
      parentStudentId,
    );
    const attachment = allowed.find((item) => item.id === attachmentId);
    if (!attachment)
      throw new NotFoundException('Assignment attachment not found');
    return {
      attachment,
      buffer: await this.minio.downloadFile(attachment.objectKey),
    };
  }

  private async assertStudentAssignmentAccess(
    assignmentId: string,
    studentId: string,
  ) {
    const assignment = await this.assignments.findOne({
      where: { id: assignmentId },
      relations: { classroom: true },
    });
    if (
      !assignment ||
      ![AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED].includes(
        assignment.status,
      )
    )
      throw new NotFoundException('Assignment not found');
    const enrolled = await this.classStudents.exists({
      where: {
        class: { id: assignment.classroom.id },
        student: { id: studentId },
        is_active: true,
      },
    });
    if (!enrolled)
      throw new ForbiddenException(
        'This assignment is not assigned to the student',
      );
    return assignment;
  }

  async listForParent(
    studentId: string,
    parentUserId: string,
    sessionId?: string,
    termId?: string,
  ) {
    const student = await this.studentForParent(studentId, parentUserId);
    const enrolments = await this.classStudents.find({
      where: { student: { id: student.id }, is_active: true },
      relations: { class: true },
    });
    const classIds = enrolments.map((item) => item.class.id);
    if (!classIds.length) return [];
    const qb = this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.classroom', 'classroom')
      .leftJoinAndSelect('assignment.subject', 'subject')
      .leftJoinAndSelect('assignment.teacher', 'teacher')
      .leftJoinAndSelect('teacher.user', 'teacherUser')
      .leftJoinAndSelect('assignment.academicSession', 'academicSession')
      .leftJoinAndSelect('assignment.academicTerm', 'academicTerm')
      .leftJoinAndSelect(
        'assignment.submissions',
        'submission',
        'submission.student_id = :studentId',
        { studentId },
      )
      .leftJoinAndSelect('submission.student', 'submissionStudent')
      .where('classroom.id IN (:...classIds)', { classIds })
      .andWhere('assignment.status IN (:...visible)', {
        visible: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED],
      })
      .orderBy('assignment.dueAt', 'ASC', 'NULLS LAST');
    if (sessionId)
      qb.andWhere('academicSession.id = :sessionId', { sessionId });
    if (termId) qb.andWhere('academicTerm.id = :termId', { termId });
    return qb.getMany();
  }

  async report(
    userId: string,
    roles: string[],
    filters: {
      sessionId?: string;
      termId?: string;
      classId?: string;
      subjectId?: string;
      status?: string;
    },
  ) {
    const assignments = (
      await this.list(userId, roles, filters.sessionId, filters.termId, false)
    ).filter(
      (item) =>
        (!filters.classId || item.classroom.id === filters.classId) &&
        (!filters.subjectId || item.subject.id === filters.subjectId),
    );
    const rows: Array<Record<string, unknown>> = [];
    for (const assignment of assignments) {
      const enrolments = await this.classStudents.find({
        where: { class: { id: assignment.classroom.id }, is_active: true },
        relations: { student: { user: true } },
      });
      const submissions = new Map(
        assignment.submissions.map((item) => [item.student.id, item]),
      );
      for (const enrolment of enrolments) {
        const submission = submissions.get(enrolment.student.id);
        const state = submission?.status ?? 'missing';
        const reportStatus = submission?.isLate ? 'late' : state;
        if (
          filters.status &&
          filters.status !== 'all' &&
          filters.status !== reportStatus
        )
          continue;
        rows.push({
          assignmentId: assignment.id,
          assignment: assignment.title,
          className: `${assignment.classroom.name}${assignment.classroom.arm ? ` ${assignment.classroom.arm}` : ''}`,
          subject: assignment.subject.name,
          dueAt: assignment.dueAt,
          studentId: enrolment.student.id,
          student:
            `${enrolment.student.user?.first_name ?? ''} ${enrolment.student.user?.last_name ?? ''}`.trim() ||
            enrolment.student.registration_number,
          registrationNumber: enrolment.student.registration_number,
          status: reportStatus,
          submittedAt: submission?.submittedAt ?? null,
          marksAwarded: submission?.marksAwarded ?? null,
          totalMarks: assignment.totalMarks,
        });
      }
    }
    const count = (status: string) =>
      rows.filter((row) => row.status === status).length;
    const gradedRows = rows.filter((row) => row.status === 'graded');
    return {
      summary: {
        total: rows.length,
        missing: count('missing') + count('draft') + count('returned'),
        submitted: count('submitted'),
        late: count('late'),
        graded: gradedRows.length,
        averagePercentage: gradedRows.length
          ? Number(
              (
                gradedRows.reduce(
                  (total, row) =>
                    total +
                    (Number(row.marksAwarded) / Number(row.totalMarks)) * 100,
                  0,
                ) / gradedRows.length
              ).toFixed(1),
            )
          : null,
      },
      rows,
    };
  }

  async processReminders(now = new Date()) {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    const lock = await runner.query(
      'SELECT pg_try_advisory_lock(214748301) AS acquired',
    );
    if (!lock[0]?.acquired) {
      await runner.release();
      return { processed: 0 };
    }
    let processed = 0;
    try {
      const assignments = await this.assignments
        .createQueryBuilder('assignment')
        .leftJoinAndSelect('assignment.classroom', 'classroom')
        .leftJoinAndSelect('assignment.subject', 'subject')
        .where('assignment.status = :status', {
          status: AssignmentStatus.PUBLISHED,
        })
        .andWhere('assignment.due_at IS NOT NULL')
        .andWhere('assignment.due_at <= :limit', {
          limit: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        })
        .getMany();
      for (const assignment of assignments) {
        const enrolments = await this.classStudents.find({
          where: { class: { id: assignment.classroom.id }, is_active: true },
          relations: { student: { user: true, parent: { user: true } } },
        });
        const completed = await this.submissions.find({
          where: { assignment: { id: assignment.id } },
          relations: { student: true },
        });
        const submitted = new Set(
          completed
            .filter((item) =>
              [
                AssignmentSubmissionStatus.SUBMITTED,
                AssignmentSubmissionStatus.GRADED,
              ].includes(item.status),
            )
            .map((item) => item.student.id),
        );
        const type =
          assignment.dueAt! <= now
            ? AssignmentReminderType.OVERDUE
            : AssignmentReminderType.DUE_SOON;
        for (const enrolment of enrolments) {
          if (submitted.has(enrolment.student.id)) continue;
          let reminder = await this.reminders.findOne({
            where: {
              assignment: { id: assignment.id },
              student: { id: enrolment.student.id },
              type,
            },
          });
          if (reminder?.sentAt) continue;
          reminder ??= await this.reminders.save(
            this.reminders.create({
              assignment,
              student: enrolment.student,
              type,
              sentAt: null,
            }),
          );
          const overdue = type === AssignmentReminderType.OVERDUE;
          await this.createNotification(
            enrolment.student.user.id,
            overdue ? 'Assignment overdue' : 'Assignment due soon',
            `${assignment.subject.name}: ${assignment.title}`,
            {
              assignment_id: assignment.id,
              deep_link: '/student/assignments',
            },
          );
          if (overdue && enrolment.student.parent?.user?.id) {
            await this.createNotification(
              enrolment.student.parent.user.id,
              'Child assignment overdue',
              `${enrolment.student.user.first_name}: ${assignment.title}`,
              {
                assignment_id: assignment.id,
                student_id: enrolment.student.id,
                deep_link: '/parent/assignments',
              },
            );
          }
          reminder.sentAt = now;
          await this.reminders.save(reminder);
          processed += 1;
        }
      }
      return { processed };
    } finally {
      await runner.query('SELECT pg_advisory_unlock(214748301)');
      await runner.release();
    }
  }

  async deleteAttachment(
    assignmentId: string,
    attachmentId: string,
    userId: string,
    roles: string[],
  ) {
    const allowed = await this.listAttachments(assignmentId, userId, roles);
    const attachment = allowed.find((item) => item.id === attachmentId);
    if (!attachment)
      throw new NotFoundException('Assignment attachment not found');
    if (attachment.uploadedBy !== userId && !this.isAdmin(roles))
      throw new ForbiddenException(
        'Only the uploader can remove this attachment',
      );
    if (roles.includes('student')) {
      const assignment = await this.assignments.findOneBy({ id: assignmentId });
      const student = await this.studentFor(userId);
      const graded = await this.submissions.exists({
        where: {
          assignment: { id: assignmentId },
          student: { id: student.id },
          status: AssignmentSubmissionStatus.GRADED,
        },
      });
      if (assignment?.status !== AssignmentStatus.PUBLISHED || graded)
        throw new BadRequestException(
          'Attachments cannot be changed after the assignment closes or is graded',
        );
    }
    await this.minio.deleteImage(attachment.objectKey);
    await this.attachments.remove(attachment);
  }

  private async notifyClass(assignment: Assignment) {
    const enrolments = await this.classStudents.find({
      where: { class: { id: assignment.classroom.id }, is_active: true },
      relations: { student: { user: true } },
    });
    await Promise.all(
      enrolments.flatMap((item) =>
        item.student?.user?.id
          ? [
              this.createNotification(
                item.student.user.id,
                'New assignment',
                `${assignment.subject.name}: ${assignment.title}`,
                {
                  assignment_id: assignment.id,
                  deep_link: '/student/assignments',
                },
              ),
            ]
          : [],
      ),
    );
  }

  async list(
    userId: string,
    roles: string[],
    sessionId?: string,
    termId?: string,
    includeArchived = false,
  ) {
    const qb = this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.classroom', 'classroom')
      .leftJoinAndSelect('assignment.subject', 'subject')
      .leftJoinAndSelect('assignment.teacher', 'teacher')
      .leftJoinAndSelect('teacher.user', 'teacherUser')
      .leftJoinAndSelect('assignment.academicSession', 'academicSession')
      .leftJoinAndSelect('assignment.academicTerm', 'academicTerm')
      .leftJoinAndSelect('assignment.submissions', 'submission')
      .leftJoinAndSelect('submission.student', 'submissionStudent')
      .orderBy('assignment.createdAt', 'DESC');
    if (sessionId)
      qb.andWhere('academicSession.id = :sessionId', { sessionId });
    if (termId) qb.andWhere('academicTerm.id = :termId', { termId });
    if (!includeArchived)
      qb.andWhere('assignment.status != :archived', {
        archived: AssignmentStatus.ARCHIVED,
      });

    if (roles.includes('student')) {
      const student = await this.studentFor(userId);
      const enrolments = await this.classStudents.find({
        where: { student: { id: student.id }, is_active: true },
        relations: { class: true },
      });
      const classIds = enrolments.map((item) => item.class.id);
      if (!classIds.length) return [];
      qb.andWhere('classroom.id IN (:...classIds)', { classIds }).andWhere(
        'assignment.status IN (:...visible)',
        { visible: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
      );
      const rows = await qb.getMany();
      return rows.map((assignment) => ({
        ...assignment,
        submissions: assignment.submissions.filter(
          (item) => item.student.id === student.id,
        ),
      }));
    }
    if (roles.includes('teacher') && !this.isAdmin(roles)) {
      const teacher = await this.teacherFor(userId);
      qb.andWhere('teacher.id = :teacherId', { teacherId: teacher.id });
    }
    return qb.getMany();
  }

  async get(id: string, userId: string, roles: string[]) {
    const assignment = await this.assignments.findOne({
      where: { id },
      relations,
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (roles.includes('student')) {
      if (
        ![AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED].includes(
          assignment.status,
        )
      )
        throw new NotFoundException('Assignment not found');
      const student = await this.studentFor(userId);
      const enrolled = await this.classStudents.exists({
        where: {
          class: { id: assignment.classroom.id },
          student: { id: student.id },
          is_active: true,
        },
      });
      if (!enrolled)
        throw new ForbiddenException(
          'This assignment is not assigned to your class',
        );
      assignment.submissions = assignment.submissions.filter(
        (item) => item.student.id === student.id,
      );
    } else await this.assertTeacherAccess(assignment, userId, roles);
    return assignment;
  }

  async create(dto: CreateAssignmentDto, userId: string, roles: string[]) {
    const [classroom, subject, session] = await Promise.all([
      this.classes.findOne({
        where: { id: dto.classId },
        relations: { academicSession: true },
      }),
      this.subjects.findOneBy({ id: dto.subjectId }),
      this.sessions.findOneBy({ id: dto.academicSessionId }),
    ]);
    if (!classroom || !subject || !session)
      throw new BadRequestException(
        'Class, subject or academic session is invalid',
      );
    if (classroom.academicSession.id !== session.id)
      throw new BadRequestException(
        'Class does not belong to the selected academic session',
      );
    const term = dto.academicTermId
      ? await this.terms.findOneBy({ id: dto.academicTermId })
      : null;
    if (dto.academicTermId && !term)
      throw new BadRequestException('Academic term is invalid');
    const teacher = await this.teacherFor(userId);
    if (!this.isAdmin(roles)) {
      const [classSubjectAssigned, scheduled] = await Promise.all([
        this.classSubjects.exists({
          where: {
            class: { id: classroom.id },
            subject: { id: subject.id },
            teacher: { id: teacher.id },
          },
        }),
        this.schedules
          .createQueryBuilder('schedule')
          .innerJoin('schedule.timetable', 'timetable')
          .where('timetable.class_id = :classId', { classId: classroom.id })
          .andWhere('timetable.is_active = true')
          .andWhere('schedule.subject_id = :subjectId', {
            subjectId: subject.id,
          })
          .andWhere('schedule.teacher_id = :teacherId', {
            teacherId: teacher.id,
          })
          .getExists(),
      ]);
      const assigned = classSubjectAssigned || scheduled;
      if (!assigned)
        throw new ForbiddenException(
          'You are not assigned to teach this subject in this class',
        );
    }
    return this.assignments.save(
      this.assignments.create({
        title: dto.title,
        instructions: dto.instructions,
        attachmentUrl: dto.attachmentUrl ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        totalMarks: dto.totalMarks ?? 100,
        classroom,
        subject,
        teacher,
        academicSession: session,
        academicTerm: term,
        status: AssignmentStatus.DRAFT,
        publishedAt: null,
        closedAt: null,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    userId: string,
    roles: string[],
  ) {
    const assignment = await this.get(id, userId, roles);
    if (assignment.status !== AssignmentStatus.DRAFT)
      throw new BadRequestException('Only draft assignments can be edited');
    Object.assign(
      assignment,
      dto,
      dto.dueAt ? { dueAt: new Date(dto.dueAt) } : {},
    );
    return this.assignments.save(assignment);
  }

  async transition(
    id: string,
    status: AssignmentStatus,
    userId: string,
    roles: string[],
  ) {
    const assignment = await this.get(id, userId, roles);
    const firstPublication =
      status === AssignmentStatus.PUBLISHED && !assignment.publishedAt;
    const allowed: Record<AssignmentStatus, AssignmentStatus[]> = {
      draft: [AssignmentStatus.PUBLISHED, AssignmentStatus.ARCHIVED],
      published: [AssignmentStatus.CLOSED, AssignmentStatus.ARCHIVED],
      closed: [AssignmentStatus.PUBLISHED, AssignmentStatus.ARCHIVED],
      archived: [AssignmentStatus.DRAFT, AssignmentStatus.CLOSED],
    };
    if (!allowed[assignment.status].includes(status))
      throw new BadRequestException(
        `Cannot move assignment from ${assignment.status} to ${status}`,
      );
    if (status === AssignmentStatus.PUBLISHED)
      assignment.publishedAt = assignment.publishedAt ?? new Date();
    if (status === AssignmentStatus.CLOSED) assignment.closedAt = new Date();
    assignment.status = status;
    const saved = await this.assignments.save(assignment);
    if (firstPublication) await this.notifyClass(assignment);
    return saved;
  }

  async saveSubmission(
    assignmentId: string,
    dto: SaveSubmissionDto,
    userId: string,
  ) {
    const assignment = await this.get(assignmentId, userId, ['student']);
    if (assignment.status !== AssignmentStatus.PUBLISHED)
      throw new BadRequestException(
        'This assignment is not accepting submissions',
      );
    const student = await this.studentFor(userId);
    let submission = await this.submissions.findOne({
      where: { assignment: { id: assignmentId }, student: { id: student.id } },
      relations: { assignment: true, student: true },
    });
    if (submission?.status === AssignmentSubmissionStatus.GRADED)
      throw new BadRequestException('A graded submission cannot be changed');
    const requestedStatus = dto.status ?? AssignmentSubmissionStatus.DRAFT;
    if (
      ![
        AssignmentSubmissionStatus.DRAFT,
        AssignmentSubmissionStatus.SUBMITTED,
      ].includes(requestedStatus)
    )
      throw new BadRequestException('Invalid student submission status');
    if (
      requestedStatus === AssignmentSubmissionStatus.SUBMITTED &&
      !dto.responseText?.trim() &&
      !dto.attachmentUrl
    ) {
      const hasAttachment = await this.attachments.exists({
        where: {
          assignment: { id: assignmentId },
          student: { id: student.id },
        },
      });
      if (!hasAttachment)
        throw new BadRequestException(
          'Add a response or attachment before submitting',
        );
    }
    submission ??= this.submissions.create({ assignment, student });
    submission.responseText = dto.responseText?.trim() || null;
    submission.attachmentUrl = dto.attachmentUrl ?? null;
    submission.status = requestedStatus;
    if (requestedStatus === AssignmentSubmissionStatus.SUBMITTED) {
      submission.submittedAt = new Date();
      submission.isLate = Boolean(
        assignment.dueAt && submission.submittedAt > assignment.dueAt,
      );
    }
    const saved = await this.submissions.save(submission);
    if (
      requestedStatus === AssignmentSubmissionStatus.SUBMITTED &&
      assignment.teacher.user?.id
    ) {
      await this.createNotification(
        assignment.teacher.user.id,
        'Assignment submitted',
        `${student.user?.first_name ?? student.registration_number} submitted ${assignment.title}`,
        { assignment_id: assignment.id, deep_link: '/teacher/assignments' },
      );
    }
    return saved;
  }

  async grade(
    assignmentId: string,
    submissionId: string,
    dto: GradeSubmissionDto,
    userId: string,
    roles: string[],
  ) {
    const assignment = await this.get(assignmentId, userId, roles);
    if (dto.marksAwarded > Number(assignment.totalMarks))
      throw new BadRequestException('Marks cannot exceed the assignment total');
    const submission = await this.submissions.findOne({
      where: { id: submissionId, assignment: { id: assignmentId } },
      relations: {
        assignment: true,
        student: { user: true, parent: { user: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status === AssignmentSubmissionStatus.DRAFT)
      throw new BadRequestException('A draft submission cannot be graded');
    submission.marksAwarded = dto.marksAwarded;
    submission.feedback = dto.feedback?.trim() || null;
    submission.status = dto.status ?? AssignmentSubmissionStatus.GRADED;
    submission.gradedAt = new Date();
    const saved = await this.submissions.save(submission);
    if (submission.student.user?.id) {
      await this.createNotification(
        submission.student.user.id,
        'Assignment graded',
        `${assignment.title} has been graded`,
        { assignment_id: assignment.id, deep_link: '/student/assignments' },
      );
    }
    if (submission.student.parent?.user?.id) {
      await this.createNotification(
        submission.student.parent.user.id,
        'Child assignment graded',
        `${submission.student.user.first_name}: ${assignment.title}`,
        {
          assignment_id: assignment.id,
          student_id: submission.student.id,
          deep_link: '/parent/assignments',
        },
      );
    }
    return saved;
  }
}
