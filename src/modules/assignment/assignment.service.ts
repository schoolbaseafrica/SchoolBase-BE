import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AcademicSession } from '../academic-session/entities/academic-session.entity';
import { Term } from '../academic-term/entities/term.entity';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassSubject } from '../class/entities/class-subject.entity';
import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';
import { Subject } from '../subject/entities/subject.entity';
import { Teacher } from '../teacher/entities/teacher.entity';

import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  SaveSubmissionDto,
  UpdateAssignmentDto,
} from './assignment.dto';
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
      const assigned = await this.classSubjects.exists({
        where: {
          class: { id: classroom.id },
          subject: { id: subject.id },
          teacher: { id: teacher.id },
        },
      });
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
    return this.assignments.save(assignment);
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
    )
      throw new BadRequestException(
        'Add a response or attachment before submitting',
      );
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
    return this.submissions.save(submission);
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
    return this.submissions.save(submission);
  }
}
