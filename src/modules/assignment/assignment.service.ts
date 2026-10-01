import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { AcademicSession } from '../academic-session/entities/academic-session.entity';
import { Term } from '../academic-term/entities/term.entity';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassSubject } from '../class/entities/class-subject.entity';
import { Class } from '../class/entities/class.entity';
import { NotificationService } from '../notification/services/notification.service';
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
export class AssignmentService {
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
    private readonly minio: MinioService,
    private readonly notifications: NotificationService,
  ) {}

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
    return this.attachments.save(
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
  }

  async listAttachments(assignmentId: string, userId: string, roles: string[]) {
    await this.get(assignmentId, userId, roles);
    const rows = await this.attachments.find({
      where: { assignment: { id: assignmentId } },
      relations: { student: { user: true } },
      order: { createdAt: 'ASC' },
    });
    if (!roles.includes('student')) return rows;
    const student = await this.studentFor(userId);
    return rows.filter(
      (item) => !item.student || item.student.id === student.id,
    );
  }

  async downloadAttachment(
    assignmentId: string,
    attachmentId: string,
    userId: string,
    roles: string[],
  ) {
    const allowed = await this.listAttachments(assignmentId, userId, roles);
    const attachment = allowed.find((item) => item.id === attachmentId);
    if (!attachment)
      throw new NotFoundException('Assignment attachment not found');
    return {
      attachment,
      buffer: await this.minio.downloadFile(attachment.objectKey),
    };
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
              this.notifications.createNotification(
                item.student.user.id,
                'New assignment',
                `${assignment.subject.name}: ${assignment.title}`,
                NotificationType.ASSIGNMENT,
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
      await this.notifications.createNotification(
        assignment.teacher.user.id,
        'Assignment submitted',
        `${student.user?.first_name ?? student.registration_number} submitted ${assignment.title}`,
        NotificationType.ASSIGNMENT,
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
      relations: { assignment: true, student: { user: true } },
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
      await this.notifications.createNotification(
        submission.student.user.id,
        'Assignment graded',
        `${assignment.title} has been graded`,
        NotificationType.ASSIGNMENT,
        { assignment_id: assignment.id, deep_link: '/student/assignments' },
      );
    }
    return saved;
  }
}
