import * as crypto from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Class } from '../class/entities/class.entity';
import { InviteRole } from '../invites/dto/invite-user.dto';
import { InviteService } from '../invites/invites.service';
import { Student } from '../student/entities/student.entity';

import { validateCbtQuestionDefinition } from './cbt-question-validation';
import { answerIsCorrect } from './cbt-scoring';
import {
  CreateCbtExamDto,
  CreateCbtQuestionDto,
  SaveCbtAnswerDto,
  UpdateCbtExamDto,
  UpdateCbtQuestionDto,
} from './dto';
import {
  CbtAnswer,
  CbtApplicant,
  CbtAttempt,
  CbtAttemptEvent,
  CbtAttemptEventType,
  CbtAttemptStatus,
  CbtExam,
  CbtExamSection,
  CbtExamStatus,
  CbtExamType,
  CbtEntranceInvite,
  CbtIntake,
  CbtQuestion,
} from './entities';

@Injectable()
export class CbtService {
  constructor(
    @InjectRepository(CbtExam)
    private readonly examRepository: Repository<CbtExam>,
    @InjectRepository(CbtQuestion)
    private readonly questionRepository: Repository<CbtQuestion>,
    @InjectRepository(CbtAttempt)
    private readonly attemptRepository: Repository<CbtAttempt>,
    @InjectRepository(CbtAnswer)
    private readonly answerRepository: Repository<CbtAnswer>,
    @InjectRepository(CbtAttemptEvent)
    private readonly eventRepository: Repository<CbtAttemptEvent>,
    @InjectRepository(CbtExamSection)
    private readonly sectionRepository: Repository<CbtExamSection>,
    @InjectRepository(CbtApplicant)
    private readonly applicantRepository: Repository<CbtApplicant>,
    @InjectRepository(CbtEntranceInvite)
    private readonly entranceInviteRepository: Repository<CbtEntranceInvite>,
    @InjectRepository(CbtIntake)
    private readonly intakeRepository: Repository<CbtIntake>,
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly inviteService: InviteService,
    private readonly dataSource: DataSource,
  ) {}

  async createExam(dto: CreateCbtExamDto, userId: string) {
    this.assertDateRange(dto.availableFrom, dto.availableTo);
    const classes = await this.resolveClasses(dto.classIds);
    let intakeId = dto.intakeId ?? null;
    if (dto.examType === CbtExamType.ENTRANCE && !intakeId) {
      const intake = await this.intakeRepository.save(
        this.intakeRepository.create({
          name: dto.name,
          applicationOpenFrom: dto.availableFrom
            ? new Date(dto.availableFrom)
            : null,
          applicationOpenTo: dto.availableTo ? new Date(dto.availableTo) : null,
          archivedAt: null,
        }),
      );
      intakeId = intake.id;
    }
    const exam = this.examRepository.create({
      ...dto,
      intakeId,
      availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
      availableTo: dto.availableTo ? new Date(dto.availableTo) : null,
      createdBy: userId,
      classes,
    });
    return this.examRepository.save(exam);
  }

  async listExams(status?: CbtExamStatus, examType?: CbtExamType) {
    return this.examRepository.find({
      where: {
        ...(status ? { status } : {}),
        ...(examType ? { examType } : {}),
      },
      relations: { classes: true, questions: true, sections: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getExamForManagement(examId: string) {
    const exam = await this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.classes', 'classes')
      .leftJoinAndSelect('exam.sections', 'sections')
      .leftJoinAndSelect('exam.questions', 'questions')
      .addSelect('questions.correctAnswer')
      .addSelect('questions.explanation')
      .where('exam.id = :examId', { examId })
      .orderBy('questions.sortOrder', 'ASC')
      .getOne();
    if (!exam) throw new NotFoundException('Examination not found');
    return exam;
  }

  async getExamAttempts(examId: string) {
    await this.getExamForManagement(examId);
    const attempts = (await this.dataSource.query(
      `SELECT
        attempt.id,
        attempt.status,
        attempt.started_at AS "startedAt",
        attempt.submitted_at AS "submittedAt",
        attempt.last_saved_at AS "lastSavedAt",
        attempt.score,
        COALESCE((attempt.metadata->>'totalMarks')::numeric, totals.total_marks, 0) AS "totalMarks",
        COALESCE((attempt.metadata->>'manualGradingRequired')::boolean, false) AS "manualGradingRequired",
        student.id AS "studentId",
        student.registration_number AS "registrationNumber",
        TRIM(CONCAT(COALESCE(app_user.first_name, ''), ' ', COALESCE(app_user.last_name, ''))) AS "studentName",
        COALESCE(answer_counts.answers, 0)::int AS "answeredQuestions"
      FROM cbt_attempts attempt
      LEFT JOIN students student ON student.id = attempt.student_id
      LEFT JOIN users app_user ON app_user.id = student.user_id
      LEFT JOIN (
        SELECT exam_id, SUM(marks)::numeric AS total_marks
        FROM cbt_questions
        WHERE is_archived = false
        GROUP BY exam_id
      ) totals ON totals.exam_id = attempt.exam_id
      LEFT JOIN (
        SELECT attempt_id, COUNT(*)::int AS answers
        FROM cbt_answers
        GROUP BY attempt_id
      ) answer_counts ON answer_counts.attempt_id = attempt.id
      WHERE attempt.exam_id = $1
      ORDER BY attempt.started_at DESC`,
      [examId],
    )) as Array<{
      id: string;
      status: CbtAttemptStatus;
      startedAt: Date;
      submittedAt: Date | null;
      lastSavedAt: Date | null;
      score: string | null;
      totalMarks: string;
      manualGradingRequired: boolean;
      studentId: string | null;
      registrationNumber: string | null;
      studentName: string;
      answeredQuestions: number;
    }>;
    const submitted = attempts.filter(
      (attempt) => attempt.status === CbtAttemptStatus.SUBMITTED,
    );
    const percentages = submitted
      .map((attempt) => {
        if (attempt.manualGradingRequired) return null;
        const total = Number(attempt.totalMarks);
        return total ? (Number(attempt.score ?? 0) / total) * 100 : null;
      })
      .filter((value): value is number => value !== null);
    return {
      summary: {
        started: attempts.length,
        inProgress: attempts.length - submitted.length,
        submitted: submitted.length,
        averagePercent: percentages.length
          ? Math.round(
              (percentages.reduce((sum, value) => sum + value, 0) /
                percentages.length) *
                100,
            ) / 100
          : null,
      },
      attempts: attempts.map((attempt) => ({
        ...attempt,
        score: attempt.score === null ? null : Number(attempt.score),
        totalMarks: Number(attempt.totalMarks),
        percentage:
          attempt.status === CbtAttemptStatus.SUBMITTED &&
          !attempt.manualGradingRequired &&
          Number(attempt.totalMarks)
            ? Math.round(
                (Number(attempt.score ?? 0) / Number(attempt.totalMarks)) *
                  10_000,
              ) / 100
            : null,
      })),
    };
  }

  async listApplicants() {
    const rows = (await this.dataSource.query(`
      SELECT applicant.id,
        applicant.full_name AS "fullName",
        applicant.email,
        applicant.phone,
        applicant.created_at AS "createdAt",
        applicant.admitted_at AS "admittedAt",
        applicant.student_id AS "studentId",
        intake.name AS "intakeName",
        COUNT(attempt.id)::int AS "attemptCount",
        COUNT(attempt.id) FILTER (WHERE attempt.status = 'submitted')::int AS "completedAttemptCount",
        MAX(
          CASE
            WHEN attempt.status = 'submitted'
              AND NULLIF(attempt.metadata->>'totalMarks', '')::numeric > 0
            THEN ROUND((attempt.score::numeric / NULLIF(attempt.metadata->>'totalMarks', '')::numeric) * 100, 2)
            ELSE NULL
          END
        )::numeric AS "bestPercentage",
        BOOL_OR(
          attempt.status = 'submitted'
          AND COALESCE((attempt.metadata->>'manualGradingRequired')::boolean, false) = false
          AND exam.pass_mark_percent IS NOT NULL
          AND NULLIF(attempt.metadata->>'totalMarks', '')::numeric > 0
          AND (attempt.score::numeric / NULLIF(attempt.metadata->>'totalMarks', '')::numeric) * 100 >= exam.pass_mark_percent
        ) AS "hasPassed",
        (ARRAY_AGG(exam.name ORDER BY attempt.started_at DESC)
          FILTER (WHERE attempt.id IS NOT NULL))[1] AS "latestExamName"
      FROM cbt_applicants applicant
      JOIN cbt_intakes intake ON intake.id = applicant.intake_id
      LEFT JOIN cbt_attempts attempt ON attempt.applicant_id = applicant.id
      LEFT JOIN cbt_exams exam ON exam.id = attempt.exam_id
      GROUP BY applicant.id, intake.name
      ORDER BY applicant.created_at DESC
    `)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      ...row,
      bestPercentage:
        row.bestPercentage === null ? null : Number(row.bestPercentage),
    }));
  }

  async getApplicant(applicantId: string) {
    const applicant = await this.applicantRepository.findOne({
      where: { id: applicantId },
      relations: { intake: true, attempts: { exam: true } },
    });
    if (!applicant) throw new NotFoundException('Applicant not found');
    return {
      ...applicant,
      attempts: applicant.attempts.map((attempt) => {
        const totalMarks = Number(
          (attempt.metadata as { totalMarks?: number } | null)?.totalMarks ?? 0,
        );
        const score = attempt.score === null ? null : Number(attempt.score);
        const percentage =
          score !== null && totalMarks > 0
            ? Math.round((score / totalMarks) * 10_000) / 100
            : null;
        return {
          ...attempt,
          score,
          totalMarks,
          percentage,
          manualGradingRequired: Boolean(
            (attempt.metadata as { manualGradingRequired?: boolean } | null)
              ?.manualGradingRequired,
          ),
        };
      }),
    };
  }

  async admitApplicant(applicantId: string) {
    const applicant = await this.applicantRepository.findOne({
      where: { id: applicantId },
      relations: { attempts: { exam: true } },
    });
    if (!applicant) throw new NotFoundException('Applicant not found');
    if (applicant.studentId) {
      return { applicant, outcome: 'student_profile_exists' };
    }
    const passedAttempt = applicant.attempts.find((attempt) => {
      if (attempt.status !== CbtAttemptStatus.SUBMITTED) return false;
      const metadata = attempt.metadata as {
        totalMarks?: number;
        manualGradingRequired?: boolean;
      } | null;
      if (metadata?.manualGradingRequired) return false;
      const total = Number(metadata?.totalMarks ?? 0);
      const percentage = total ? (Number(attempt.score ?? 0) / total) * 100 : 0;
      return (
        attempt.exam.examType === CbtExamType.ENTRANCE &&
        attempt.exam.passMarkPercent !== null &&
        percentage >= attempt.exam.passMarkPercent
      );
    });
    if (!passedAttempt) {
      throw new ConflictException(
        'This applicant does not yet have a completed passing result',
      );
    }
    const existingStudent = await this.studentRepository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .where('lower(user.email) = :email', {
        email: applicant.email.toLowerCase(),
      })
      .getOne();
    if (existingStudent) {
      applicant.studentId = existingStudent.id;
      applicant.admittedAt = applicant.admittedAt ?? new Date();
      await this.applicantRepository.save(applicant);
      return { applicant, outcome: 'linked_existing_student' };
    }
    await this.inviteService.inviteUser({
      email: applicant.email,
      full_name: applicant.fullName,
      role: InviteRole.STUDENT,
    });
    applicant.admittedAt = new Date();
    await this.applicantRepository.save(applicant);
    return { applicant, outcome: 'student_invite_sent' };
  }

  async listPublicExams() {
    const now = new Date();
    return this.examRepository
      .createQueryBuilder('exam')
      .loadRelationCountAndMap(
        'exam.questionCount',
        'exam.questions',
        'question',
        (query) => query.andWhere('question.is_archived = false'),
      )
      .where('exam.exam_type = :type', { type: CbtExamType.ENTRANCE })
      .andWhere('exam.status = :status', { status: CbtExamStatus.PUBLISHED })
      .andWhere(
        '(exam.available_from IS NULL OR exam.available_from <= :now)',
        {
          now,
        },
      )
      .andWhere('(exam.available_to IS NULL OR exam.available_to >= :now)', {
        now,
      })
      .orderBy('exam.available_from', 'ASC', 'NULLS FIRST')
      .getMany();
  }

  async getPublicExam(examId: string) {
    const exam = await this.examRepository.findOne({ where: { id: examId } });
    if (!exam || exam.examType !== CbtExamType.ENTRANCE) {
      throw new NotFoundException('External examination not found');
    }
    this.assertExternalExamAvailable(exam);
    const questionCount = await this.questionRepository.count({
      where: { examId, isArchived: false },
    });
    return { ...exam, questionCount };
  }

  async startPublicAttempt(
    examId: string,
    candidate: { fullName: string; email: string; phone?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const exam = await manager.getRepository(CbtExam).findOne({
        where: { id: examId },
        relations: { questions: true },
      });
      if (!exam || exam.examType !== CbtExamType.ENTRANCE) {
        throw new NotFoundException('External examination not found');
      }
      this.assertExternalExamAvailable(exam);
      let intakeId = exam.intakeId;
      if (!intakeId) {
        const intake = await manager.getRepository(CbtIntake).save(
          manager.getRepository(CbtIntake).create({
            name: exam.name,
            applicationOpenFrom: exam.availableFrom,
            applicationOpenTo: exam.availableTo,
            archivedAt: null,
          }),
        );
        intakeId = intake.id;
        exam.intakeId = intakeId;
        await manager.getRepository(CbtExam).save(exam);
      }
      const email = candidate.email.trim().toLowerCase();
      let applicant = await manager
        .getRepository(CbtApplicant)
        .createQueryBuilder('applicant')
        .where('applicant.intake_id = :intakeId', { intakeId })
        .andWhere('lower(applicant.email) = :email', { email })
        .getOne();
      if (!applicant) {
        applicant = await manager.getRepository(CbtApplicant).save(
          manager.getRepository(CbtApplicant).create({
            intakeId,
            fullName: candidate.fullName.trim(),
            email,
            phone: candidate.phone?.trim() || null,
            admittedAt: null,
            studentId: null,
          }),
        );
      }
      await this.acquireTransactionLock(
        manager,
        'public-attempt',
        examId,
        applicant.id,
      );
      const attemptRepo = manager.getRepository(CbtAttempt);
      let attempt = await attemptRepo.findOne({
        where: {
          examId,
          applicantId: applicant.id,
          status: CbtAttemptStatus.IN_PROGRESS,
        },
        order: { startedAt: 'DESC' },
      });
      if (!attempt) {
        const attemptCount = await attemptRepo.count({
          where: { examId, applicantId: applicant.id },
        });
        if (attemptCount >= exam.maxAttempts) {
          throw new ConflictException('Maximum attempts reached');
        }
        attempt = await this.createAttempt(
          attemptRepo,
          manager.getRepository(CbtAttemptEvent),
          exam,
          { applicantId: applicant.id },
        );
      }
      const accessToken = crypto.randomBytes(32).toString('hex');
      const tokenDigest = this.tokenDigest(accessToken);
      const expiresAt = new Date(
        Math.max(
          Date.now() + 24 * 60 * 60_000,
          attempt.startedAt.getTime() + exam.timeLimitMinutes * 60_000,
        ),
      );
      await manager.getRepository(CbtEntranceInvite).save(
        manager.getRepository(CbtEntranceInvite).create({
          applicantId: applicant.id,
          examId,
          token: tokenDigest,
          expiresAt,
        }),
      );
      return {
        accessToken,
        candidate: { fullName: applicant.fullName, email: applicant.email },
        attempt: this.buildAttemptPayload(attempt, exam),
      };
    });
  }

  async getPublicAttempt(attemptId: string, accessToken: string) {
    const { attempt, exam } = await this.getTokenOwnedAttempt(
      attemptId,
      accessToken,
    );
    const answers = await this.answerRepository.find({ where: { attemptId } });
    const reveal =
      attempt.status === CbtAttemptStatus.SUBMITTED &&
      exam.showResultImmediately;
    return {
      ...this.buildAttemptPayload(attempt, exam),
      answers: answers.map((answer) =>
        this.studentAnswerPayload(answer, reveal),
      ),
    };
  }

  async savePublicAnswer(
    attemptId: string,
    questionId: string,
    accessToken: string,
    dto: SaveCbtAnswerDto,
  ) {
    const { attempt } = await this.getTokenOwnedAttempt(attemptId, accessToken);
    return this.saveAnswerForOwner(attemptId, questionId, dto, {
      applicantId: attempt.applicantId!,
    });
  }

  async recordPublicEvent(
    attemptId: string,
    accessToken: string,
    eventType: CbtAttemptEventType,
    metadata?: Record<string, unknown>,
  ) {
    const { attempt } = await this.getTokenOwnedAttempt(attemptId, accessToken);
    this.assertAttemptOpen(attempt);
    return this.eventRepository.save(
      this.eventRepository.create({
        attemptId,
        eventType,
        metadata: metadata ?? null,
      }),
    );
  }

  async submitPublicAttempt(attemptId: string, accessToken: string) {
    const { attempt } = await this.getTokenOwnedAttempt(attemptId, accessToken);
    return this.submitOwnedAttempt(attemptId, {
      applicantId: attempt.applicantId!,
    });
  }

  async updateExam(examId: string, dto: UpdateCbtExamDto) {
    const exam = await this.getDraftExam(examId);
    this.assertDateRange(
      dto.availableFrom === undefined
        ? exam.availableFrom?.toISOString()
        : dto.availableFrom,
      dto.availableTo === undefined
        ? exam.availableTo?.toISOString()
        : dto.availableTo,
    );
    const { classIds, availableFrom, availableTo, ...changes } = dto;
    Object.assign(exam, changes);
    if (availableFrom !== undefined) {
      exam.availableFrom = availableFrom ? new Date(availableFrom) : null;
    }
    if (availableTo !== undefined) {
      exam.availableTo = availableTo ? new Date(availableTo) : null;
    }
    if (classIds !== undefined)
      exam.classes = await this.resolveClasses(classIds);
    return this.examRepository.save(exam);
  }

  async addQuestion(examId: string, dto: CreateCbtQuestionDto) {
    await this.getDraftExam(examId);
    this.assertQuestion(dto);
    await this.assertSectionBelongsToExam(dto.sectionId, examId);
    const question = this.questionRepository.create({
      ...dto,
      examId,
      options: dto.options ?? null,
      correctAnswer: dto.correctAnswer ?? null,
      sectionId: dto.sectionId ?? null,
      topic: dto.topic ?? null,
      explanation: dto.explanation ?? null,
      marks: String(dto.marks),
    });
    return this.questionRepository.save(question);
  }

  async updateQuestion(questionId: string, dto: UpdateCbtQuestionDto) {
    const question = await this.questionRepository
      .createQueryBuilder('question')
      .addSelect('question.correctAnswer')
      .addSelect('question.explanation')
      .where('question.id = :questionId', { questionId })
      .getOne();
    if (!question) throw new NotFoundException('Question not found');
    if (!question.examId)
      throw new BadRequestException(
        'Question is not attached to an examination',
      );
    await this.getDraftExam(question.examId);
    await this.assertSectionBelongsToExam(dto.sectionId, question.examId);
    const merged = {
      type: dto.type ?? question.type,
      options: dto.options ?? question.options ?? undefined,
      correctAnswer: dto.correctAnswer ?? question.correctAnswer ?? undefined,
    } as CreateCbtQuestionDto;
    this.assertQuestion(merged);
    Object.assign(question, dto);
    if (dto.marks !== undefined) question.marks = String(dto.marks);
    return this.questionRepository.save(question);
  }

  async publishExam(examId: string) {
    const exam = await this.getExamForManagement(examId);
    if (!exam.questions.length) {
      throw new BadRequestException(
        'Add at least one question before publishing',
      );
    }
    if (exam.examType === CbtExamType.IN_SCHOOL && !exam.classes.length) {
      throw new BadRequestException(
        'Assign at least one class before publishing an in-school examination',
      );
    }
    exam.questions.forEach((question) =>
      this.assertQuestion({
        type: question.type,
        options: question.options ?? undefined,
        correctAnswer: question.correctAnswer ?? undefined,
      } as CreateCbtQuestionDto),
    );
    this.assertDateRange(
      exam.availableFrom?.toISOString(),
      exam.availableTo?.toISOString(),
    );
    exam.status = CbtExamStatus.PUBLISHED;
    return this.examRepository.save(exam);
  }

  async listStudentExams(studentId: string) {
    const student = await this.getStudent(studentId);
    const now = new Date();
    const exams = await this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.classes', 'class')
      .loadRelationCountAndMap(
        'exam.questionCount',
        'exam.questions',
        'question',
        (qb) => qb.andWhere('question.is_archived = false'),
      )
      .where('exam.status = :status', { status: CbtExamStatus.PUBLISHED })
      .andWhere(
        '(exam.available_from IS NULL OR exam.available_from <= :now)',
        { now },
      )
      .andWhere('(exam.available_to IS NULL OR exam.available_to >= :now)', {
        now,
      })
      .andWhere(
        '(NOT EXISTS (SELECT 1 FROM cbt_exam_classes access WHERE access.exam_id = exam.id) OR class.id = :classId)',
        { classId: student.current_class_id },
      )
      .orderBy('exam.available_from', 'ASC', 'NULLS FIRST')
      .getMany();

    const attempts = await this.attemptRepository.find({
      where: { studentId },
      order: { startedAt: 'DESC' },
    });
    return exams.map((exam) => ({
      ...exam,
      attempts: attempts
        .filter((attempt) => attempt.examId === exam.id)
        .map((attempt) => ({
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
        })),
    }));
  }

  async startOrResumeAttempt(examId: string, studentId: string) {
    return this.dataSource.transaction(async (manager) => {
      await this.acquireTransactionLock(manager, 'attempt', examId, studentId);
      const examRepo = manager.getRepository(CbtExam);
      const attemptRepo = manager.getRepository(CbtAttempt);
      const eventRepo = manager.getRepository(CbtAttemptEvent);
      const exam = await examRepo.findOne({
        where: { id: examId },
        relations: { classes: true, questions: true },
      });
      if (!exam) throw new NotFoundException('Examination not found');
      const student = await manager.getRepository(Student).findOne({
        where: { id: studentId },
      });
      if (!student) throw new NotFoundException('Student profile not found');
      this.assertExamAvailable(exam, student.current_class_id);

      const active = await attemptRepo.findOne({
        where: { examId, studentId, status: CbtAttemptStatus.IN_PROGRESS },
        order: { startedAt: 'DESC' },
      });
      if (active) {
        await eventRepo.save(
          eventRepo.create({
            attemptId: active.id,
            eventType: CbtAttemptEventType.RESUMED,
          }),
        );
        return this.buildAttemptPayload(active, exam);
      }

      const attemptCount = await attemptRepo.count({
        where: { examId, studentId },
      });
      if (attemptCount >= exam.maxAttempts) {
        throw new ConflictException('Maximum attempts reached');
      }

      const questionIds = exam.questions
        .filter((question) => !question.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((question) => question.id);
      if (!questionIds.length)
        throw new BadRequestException('This examination has no questions');
      if (exam.shuffleQuestions) this.shuffle(questionIds);
      const optionOrder = Object.fromEntries(
        exam.questions
          .filter((question) => question.options?.length)
          .map((question) => {
            const ids = question.options!.map((option) => option.id);
            if (exam.shuffleOptions) this.shuffle(ids);
            return [question.id, ids];
          }),
      );

      const attempt = await attemptRepo.save(
        attemptRepo.create({
          examId,
          studentId,
          startedAt: new Date(),
          status: CbtAttemptStatus.IN_PROGRESS,
          metadata: {
            questionOrder: questionIds,
            optionOrder,
            timeLimitMinutes: exam.timeLimitMinutes,
          },
        }),
      );
      await eventRepo.save(
        eventRepo.create({
          attemptId: attempt.id,
          eventType: CbtAttemptEventType.STARTED,
        }),
      );
      return this.buildAttemptPayload(attempt, exam);
    });
  }

  async getAttempt(attemptId: string, studentId: string) {
    const attempt = await this.getOwnedAttempt(attemptId, studentId);
    const exam = await this.examRepository.findOne({
      where: { id: attempt.examId },
      relations: { questions: true },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    const answers = await this.answerRepository.find({ where: { attemptId } });
    const revealGrading =
      attempt.status === CbtAttemptStatus.SUBMITTED &&
      exam.showResultImmediately;
    return {
      ...this.buildAttemptPayload(attempt, exam),
      answers: answers.map((answer) =>
        this.studentAnswerPayload(answer, revealGrading),
      ),
    };
  }

  async saveAnswer(
    attemptId: string,
    questionId: string,
    studentId: string,
    dto: SaveCbtAnswerDto,
  ) {
    return this.saveAnswerForOwner(attemptId, questionId, dto, { studentId });
  }

  private async saveAnswerForOwner(
    attemptId: string,
    questionId: string,
    dto: SaveCbtAnswerDto,
    owner: { studentId?: string; applicantId?: string },
  ) {
    this.assertAnswerPayload(dto.answer);
    return this.dataSource.transaction(async (manager) => {
      await this.acquireTransactionLock(
        manager,
        'answer',
        attemptId,
        questionId,
      );
      const attemptRepo = manager.getRepository(CbtAttempt);
      const answerRepo = manager.getRepository(CbtAnswer);
      const eventRepo = manager.getRepository(CbtAttemptEvent);
      const attempt = await attemptRepo.findOne({
        where: { id: attemptId, ...owner },
        relations: { exam: true },
      });
      if (!attempt) throw new NotFoundException('Attempt not found');
      this.assertAttemptOpen(attempt);
      const question = await manager.getRepository(CbtQuestion).findOne({
        where: { id: questionId, examId: attempt.examId, isArchived: false },
      });
      if (!question)
        throw new NotFoundException('Question not found in this examination');

      const existing = await answerRepo.findOne({
        where: { attemptId, questionId },
      });
      if (existing && dto.revision < existing.revision) {
        throw new ConflictException({
          message: 'A newer answer is already saved',
          serverRevision: existing.revision,
          savedAnswer: existing.answerData,
        });
      }
      if (existing && dto.revision === existing.revision)
        return this.studentAnswerPayload(existing, false);

      const savedAt = new Date();
      const answer = answerRepo.create({
        ...(existing ?? {}),
        attemptId,
        questionId,
        answerData: dto.answer,
        selectedAnswer: JSON.stringify(dto.answer),
        revision: dto.revision,
        savedAt,
      });
      const saved = await answerRepo.save(answer);
      await attemptRepo.update(attemptId, { lastSavedAt: savedAt });
      await eventRepo.save(
        eventRepo.create({
          attemptId,
          eventType: CbtAttemptEventType.ANSWER_SAVED,
          metadata: { questionId, revision: dto.revision },
        }),
      );
      return this.studentAnswerPayload(saved, false);
    });
  }

  async recordConnectionEvent(
    attemptId: string,
    studentId: string,
    eventType:
      | CbtAttemptEventType.CONNECTION_LOST
      | CbtAttemptEventType.CONNECTION_RESTORED,
    metadata?: Record<string, unknown>,
  ) {
    if (metadata && JSON.stringify(metadata).length > 16_000) {
      throw new BadRequestException('Connection metadata is too large');
    }
    const attempt = await this.getOwnedAttempt(attemptId, studentId);
    this.assertAttemptOpen(attempt);
    return this.eventRepository.save(
      this.eventRepository.create({
        attemptId,
        eventType,
        metadata: metadata ?? null,
      }),
    );
  }

  async submitAttempt(attemptId: string, studentId: string) {
    return this.submitOwnedAttempt(attemptId, { studentId });
  }

  private async submitOwnedAttempt(
    attemptId: string,
    owner: { studentId?: string; applicantId?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(CbtAttempt);
      const answerRepo = manager.getRepository(CbtAnswer);
      const eventRepo = manager.getRepository(CbtAttemptEvent);
      const attempt = await attemptRepo
        .createQueryBuilder('attempt')
        .setLock('pessimistic_write')
        .where('attempt.id = :attemptId', { attemptId })
        .andWhere(
          owner.studentId
            ? 'attempt.student_id = :ownerId'
            : 'attempt.applicant_id = :ownerId',
          { ownerId: owner.studentId ?? owner.applicantId },
        )
        .getOne();
      if (!attempt) throw new NotFoundException('Attempt not found');
      const exam = await manager.getRepository(CbtExam).findOne({
        where: { id: attempt.examId },
      });
      if (!exam) throw new NotFoundException('Examination not found');
      if (attempt.status === CbtAttemptStatus.SUBMITTED) {
        return this.submissionPayload(attempt, exam);
      }

      const questions = await manager
        .getRepository(CbtQuestion)
        .createQueryBuilder('question')
        .addSelect('question.correctAnswer')
        .where('question.examId = :examId', { examId: attempt.examId })
        .andWhere('question.isArchived = false')
        .getMany();
      const answers = await answerRepo.find({ where: { attemptId } });
      let score = 0;
      let totalMarks = 0;
      let manualGradingRequired = false;
      for (const question of questions) {
        const marks = Number(question.marks);
        totalMarks += marks;
        const answer = answers.find((item) => item.questionId === question.id);
        if (!answer) continue;
        const isCorrect = answerIsCorrect(
          question.type,
          answer.answerData,
          question.correctAnswer,
        );
        answer.isCorrect = isCorrect;
        if (isCorrect === null && answer.answerData !== null) {
          manualGradingRequired = true;
        }
        if (isCorrect === true) {
          answer.marksAwarded = String(marks);
          score += marks;
        } else if (isCorrect === false) {
          answer.marksAwarded = '0';
        }
        await answerRepo.save(answer);
      }
      attempt.score = String(score);
      attempt.status = CbtAttemptStatus.SUBMITTED;
      attempt.submittedAt = new Date();
      attempt.metadata = {
        ...(attempt.metadata ?? {}),
        totalMarks,
        manualGradingRequired,
      };
      await attemptRepo.save(attempt);
      await eventRepo.save(
        eventRepo.create({
          attemptId,
          eventType: CbtAttemptEventType.SUBMITTED,
        }),
      );
      return this.submissionPayload(attempt, exam);
    });
  }

  private async getDraftExam(examId: string) {
    const exam = await this.examRepository.findOne({
      where: { id: examId },
      relations: { classes: true },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.status !== CbtExamStatus.DRAFT) {
      throw new ConflictException('Only draft examinations can be changed');
    }
    return exam;
  }

  private async createAttempt(
    attemptRepo: Repository<CbtAttempt>,
    eventRepo: Repository<CbtAttemptEvent>,
    exam: CbtExam,
    owner: { studentId?: string; applicantId?: string },
  ) {
    const questionIds = exam.questions
      .filter((question) => !question.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => question.id);
    if (!questionIds.length) {
      throw new BadRequestException('This examination has no questions');
    }
    if (exam.shuffleQuestions) this.shuffle(questionIds);
    const optionOrder = Object.fromEntries(
      exam.questions
        .filter((question) => question.options?.length)
        .map((question) => {
          const ids = question.options!.map((option) => option.id);
          if (exam.shuffleOptions) this.shuffle(ids);
          return [question.id, ids];
        }),
    );
    const attempt = await attemptRepo.save(
      attemptRepo.create({
        examId: exam.id,
        studentId: owner.studentId ?? null,
        applicantId: owner.applicantId ?? null,
        startedAt: new Date(),
        status: CbtAttemptStatus.IN_PROGRESS,
        metadata: {
          questionOrder: questionIds,
          optionOrder,
          timeLimitMinutes: exam.timeLimitMinutes,
        },
      }),
    );
    await eventRepo.save(
      eventRepo.create({
        attemptId: attempt.id,
        eventType: CbtAttemptEventType.STARTED,
      }),
    );
    return attempt;
  }

  private assertExternalExamAvailable(exam: CbtExam) {
    if (
      exam.examType !== CbtExamType.ENTRANCE ||
      exam.status !== CbtExamStatus.PUBLISHED
    ) {
      throw new ForbiddenException('External examination is not published');
    }
    const now = Date.now();
    if (exam.availableFrom && now < exam.availableFrom.getTime()) {
      throw new ForbiddenException('External examination is not available yet');
    }
    if (exam.availableTo && now > exam.availableTo.getTime()) {
      throw new ForbiddenException('External examination is closed');
    }
  }

  private async getTokenOwnedAttempt(attemptId: string, accessToken: string) {
    if (!accessToken)
      throw new ForbiddenException('Candidate access token required');
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId },
      relations: { exam: { questions: true } },
    });
    if (!attempt?.applicantId) throw new NotFoundException('Attempt not found');
    const invite = await this.entranceInviteRepository.findOne({
      where: {
        applicantId: attempt.applicantId,
        examId: attempt.examId,
        token: this.tokenDigest(accessToken),
      },
      order: { createdAt: 'DESC' },
    });
    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Candidate access has expired');
    }
    return { attempt, exam: attempt.exam };
  }

  private tokenDigest(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async getStudent(studentId: string) {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    return student;
  }

  private async getOwnedAttempt(attemptId: string, studentId: string) {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, studentId },
      relations: { exam: true },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    return attempt;
  }

  private assertAttemptOpen(attempt: CbtAttempt) {
    if (attempt.status !== CbtAttemptStatus.IN_PROGRESS) {
      throw new ConflictException('This attempt has already been submitted');
    }
    const duration = Number(
      (attempt.metadata as { timeLimitMinutes?: number } | null)
        ?.timeLimitMinutes ?? attempt.exam?.timeLimitMinutes,
    );
    if (
      duration &&
      Date.now() > attempt.startedAt.getTime() + duration * 60_000
    ) {
      throw new ConflictException('The examination time has elapsed');
    }
  }

  private assertExamAvailable(exam: CbtExam, currentClassId: string | null) {
    if (exam.status !== CbtExamStatus.PUBLISHED)
      throw new ForbiddenException('Examination is not published');
    const now = Date.now();
    if (exam.availableFrom && now < exam.availableFrom.getTime()) {
      throw new ForbiddenException('Examination is not available yet');
    }
    if (exam.availableTo && now > exam.availableTo.getTime()) {
      throw new ForbiddenException('Examination is closed');
    }
    if (
      exam.classes.length &&
      !exam.classes.some((item) => item.id === currentClassId)
    ) {
      throw new ForbiddenException('Examination is not assigned to your class');
    }
  }

  private buildAttemptPayload(attempt: CbtAttempt, exam: CbtExam) {
    const metadata = attempt.metadata as {
      questionOrder?: string[];
      optionOrder?: Record<string, string[]>;
    } | null;
    const order = (metadata?.questionOrder ?? []).slice();
    const questions = exam.questions.filter((question) => !question.isArchived);
    questions.sort((a, b) => {
      if (!order.length) return a.sortOrder - b.sortOrder;
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadline: new Date(
        attempt.startedAt.getTime() + exam.timeLimitMinutes * 60_000,
      ),
      lastSavedAt: attempt.lastSavedAt,
      exam: {
        id: exam.id,
        name: exam.name,
        instructions: exam.instructions,
        timeLimitMinutes: exam.timeLimitMinutes,
        shuffleOptions: exam.shuffleOptions,
      },
      questions: questions.map((question) => {
        const optionOrder = metadata?.optionOrder?.[question.id] ?? [];
        return {
          id: question.id,
          createdAt: question.createdAt,
          updatedAt: question.updatedAt,
          examId: question.examId,
          sectionId: question.sectionId,
          type: question.type,
          body: question.body,
          options: optionOrder.length
            ? [...(question.options ?? [])].sort(
                (a, b) => optionOrder.indexOf(a.id) - optionOrder.indexOf(b.id),
              )
            : question.options,
          marks: question.marks,
          sortOrder: question.sortOrder,
          topic: question.topic,
          difficulty: question.difficulty,
        };
      }),
    };
  }

  private submissionPayload(attempt: CbtAttempt, exam: CbtExam) {
    const totalMarks = Number(
      (attempt.metadata as { totalMarks?: number } | null)?.totalMarks ?? 0,
    );
    const score = Number(attempt.score ?? 0);
    const percentage =
      totalMarks > 0 ? Math.round((score / totalMarks) * 10_000) / 100 : 0;
    const base = {
      id: attempt.id,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      requiresManualGrading: Boolean(
        (attempt.metadata as { manualGradingRequired?: boolean } | null)
          ?.manualGradingRequired,
      ),
    };
    if (!exam.showResultImmediately || base.requiresManualGrading) return base;
    return {
      ...base,
      score,
      totalMarks,
      percentage,
      passed:
        exam.passMarkPercent === null
          ? null
          : percentage >= exam.passMarkPercent,
    };
  }

  private async resolveClasses(classIds?: string[]) {
    if (!classIds?.length) return [];
    const uniqueIds = [...new Set(classIds)];
    const classes = await this.classRepository.findBy({ id: In(uniqueIds) });
    if (classes.length !== uniqueIds.length)
      throw new BadRequestException('One or more classes do not exist');
    return classes;
  }

  private async assertSectionBelongsToExam(
    sectionId: string | undefined,
    examId: string,
  ) {
    if (!sectionId) return;
    const exists = await this.sectionRepository.exists({
      where: { id: sectionId, examId },
    });
    if (!exists) {
      throw new BadRequestException(
        'The selected section does not belong to this examination',
      );
    }
  }

  private assertDateRange(from?: string | null, to?: string | null) {
    if (from && to && new Date(from) >= new Date(to)) {
      throw new BadRequestException('Availability end must be after its start');
    }
  }

  private assertAnswerPayload(answer: Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(answer, 'value')) {
      throw new BadRequestException('Answer payload must include a value');
    }
    if (JSON.stringify(answer).length > 100_000) {
      throw new BadRequestException('Answer is too large');
    }
  }

  private assertQuestion(
    dto: Pick<CreateCbtQuestionDto, 'type' | 'options' | 'correctAnswer'>,
  ) {
    const error = validateCbtQuestionDefinition(dto);
    if (error) throw new BadRequestException(error);
  }

  private studentAnswerPayload(answer: CbtAnswer, revealGrading: boolean) {
    const payload = {
      id: answer.id,
      questionId: answer.questionId,
      answerData: answer.answerData,
      revision: answer.revision,
      savedAt: answer.savedAt,
    };
    if (!revealGrading) return payload;
    return {
      ...payload,
      isCorrect: answer.isCorrect,
      marksAwarded:
        answer.marksAwarded === null ? null : Number(answer.marksAwarded),
    };
  }

  private async acquireTransactionLock(
    manager: {
      query: (query: string, parameters?: unknown[]) => Promise<unknown>;
    },
    ...parts: string[]
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [parts.join(':')],
    );
  }

  private shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
  }
}
