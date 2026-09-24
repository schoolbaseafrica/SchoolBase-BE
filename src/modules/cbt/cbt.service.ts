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
  CreateCbtBankQuestionDto,
  CreateCbtExamDto,
  CreateCbtQuestionDto,
  CreateCbtSectionDto,
  GradeCbtAnswerDto,
  ImportCbtBankQuestionDto,
  ListCbtApplicantsDto,
  ListCbtExamsDto,
  ListCbtQuestionBankDto,
  SaveCbtAnswerDto,
  TransitionCbtExamDto,
  UpdateCbtExamDto,
  UpdateCbtQuestionDto,
  UpdateCbtSectionDto,
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

interface ICbtAttemptMetadata extends Record<string, unknown> {
  totalMarks?: number;
  manualGradingRequired?: boolean;
  gradingCompletedAt?: string;
  resultPublishedAt?: string;
  resultPublishedBy?: string;
  gradedAnswers?: Record<
    string,
    { graderId: string; gradedAt: string; comment: string | null }
  >;
  questionOrder?: string[];
  optionOrder?: Record<string, string[]>;
}

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
    if (!dto.sessionId) {
      throw new BadRequestException(
        'Select an academic session before creating an examination',
      );
    }
    const period = await this.resolveCbtPeriod({
      sessionId: dto.sessionId,
      termId: dto.termId,
      scope: dto.termId ? 'term' : 'session',
    });
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
      sessionId: period.sessionId,
      termId: period.termId,
      intakeId,
      availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
      availableTo: dto.availableTo ? new Date(dto.availableTo) : null,
      createdBy: userId,
      classes,
    });
    return this.examRepository.save(exam);
  }

  async listExams(query: ListCbtExamsDto) {
    const period = await this.resolveCbtPeriod(query);
    const builder = this.examRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.classes', 'classes')
      .leftJoinAndSelect('exam.questions', 'questions')
      .leftJoinAndSelect('exam.sections', 'sections')
      .where('exam.session_id = :sessionId', { sessionId: period.sessionId })
      .orderBy('exam.created_at', 'DESC');
    if (period.termId) {
      builder.andWhere('exam.term_id = :termId', {
        termId: period.termId,
      });
    }
    if (query.status)
      builder.andWhere('exam.status = :status', { status: query.status });
    if (query.examType)
      builder.andWhere('exam.exam_type = :examType', {
        examType: query.examType,
      });
    return builder.getMany();
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
      .orderBy('sections.sortOrder', 'ASC')
      .addOrderBy('questions.sortOrder', 'ASC')
      .getOne();
    if (!exam) throw new NotFoundException('Examination not found');
    return exam;
  }

  async getExamAttempts(examId: string) {
    const exam = await this.getExamForManagement(examId);
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
        attempt.metadata->>'resultPublishedAt' AS "resultPublishedAt",
        student.id AS "studentId",
        student.registration_number AS "registrationNumber",
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(app_user.first_name, ''), ' ', COALESCE(app_user.last_name, ''))), ''),
          applicant.full_name,
          'Unknown candidate'
        ) AS "studentName",
        applicant.email AS "applicantEmail",
        COALESCE(answer_counts.answers, 0)::int AS "answeredQuestions",
        COALESCE(totals.question_count, 0)::int AS "questionCount",
        COALESCE(event_counts.connection_lost, 0)::int AS "connectionLostCount",
        COALESCE(event_counts.visibility_hidden, 0)::int AS "visibilityHiddenCount",
        event_counts.last_event_at AS "lastEventAt",
        event_counts.last_event_type AS "lastEventType"
      FROM cbt_attempts attempt
      LEFT JOIN students student ON student.id = attempt.student_id
      LEFT JOIN users app_user ON app_user.id = student.user_id
      LEFT JOIN cbt_applicants applicant ON applicant.id = attempt.applicant_id
      LEFT JOIN (
        SELECT exam_id, SUM(marks)::numeric AS total_marks, COUNT(*)::int AS question_count
        FROM cbt_questions
        WHERE is_archived = false
        GROUP BY exam_id
      ) totals ON totals.exam_id = attempt.exam_id
      LEFT JOIN (
        SELECT attempt_id, COUNT(*)::int AS answers
        FROM cbt_answers
        GROUP BY attempt_id
      ) answer_counts ON answer_counts.attempt_id = attempt.id
      LEFT JOIN (
        SELECT attempt_id,
          COUNT(*) FILTER (WHERE event_type = 'connection_lost')::int AS connection_lost,
          COUNT(*) FILTER (WHERE event_type = 'visibility_hidden')::int AS visibility_hidden,
          MAX(created_at) AS last_event_at
          ,(ARRAY_AGG(event_type ORDER BY created_at DESC))[1] AS last_event_type
        FROM cbt_attempt_events
        GROUP BY attempt_id
      ) event_counts ON event_counts.attempt_id = attempt.id
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
      resultPublishedAt: string | null;
      studentId: string | null;
      registrationNumber: string | null;
      studentName: string;
      answeredQuestions: number;
      questionCount: number;
      connectionLostCount: number;
      visibilityHiddenCount: number;
      lastEventAt: Date | null;
      lastEventType: CbtAttemptEventType | null;
    }>;
    const expectedRow = (await this.dataSource.query(
      `SELECT COUNT(DISTINCT cs.student_id)::int AS count
       FROM cbt_exam_classes exam_class
       JOIN class_students cs ON cs.class_id = exam_class.class_id AND cs.is_active = true
       JOIN students student ON student.id = cs.student_id AND student.is_deleted = false
       WHERE exam_class.exam_id = $1`,
      [examId],
    )) as Array<{ count: number }>;
    const expectedCandidates =
      exam.examType === CbtExamType.IN_SCHOOL
        ? Number(expectedRow[0]?.count ?? 0)
        : attempts.length;
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
    const sortedPercentages = [...percentages].sort((a, b) => a - b);
    const medianPercent = sortedPercentages.length
      ? sortedPercentages.length % 2
        ? sortedPercentages[Math.floor(sortedPercentages.length / 2)]
        : (sortedPercentages[sortedPercentages.length / 2 - 1] +
            sortedPercentages[sortedPercentages.length / 2]) /
          2
      : null;
    const scoreDistribution = [
      { label: '0-39', minimum: 0, maximum: 40 },
      { label: '40-49', minimum: 40, maximum: 50 },
      { label: '50-59', minimum: 50, maximum: 60 },
      { label: '60-69', minimum: 60, maximum: 70 },
      { label: '70-100', minimum: 70, maximum: 101 },
    ].map(({ label, minimum, maximum }) => ({
      label,
      count: percentages.filter((value) => value >= minimum && value < maximum)
        .length,
    }));
    const questionAnalytics = (await this.dataSource.query(
      `SELECT question.id, question.body, question.topic, question.difficulty,
        section.title AS "sectionTitle",
        COUNT(DISTINCT attempt.id)::int AS "attemptCount",
        COUNT(answer.id)::int AS "answeredCount",
        COUNT(answer.id) FILTER (WHERE answer.is_correct = true)::int AS "correctCount"
       FROM cbt_questions question
       LEFT JOIN cbt_exam_sections section ON section.id = question.section_id
       LEFT JOIN cbt_attempts attempt ON attempt.exam_id = question.exam_id
       LEFT JOIN cbt_answers answer ON answer.attempt_id = attempt.id AND answer.question_id = question.id
       WHERE question.exam_id = $1 AND question.is_archived = false
       GROUP BY question.id, section.title
       ORDER BY question.sort_order ASC`,
      [examId],
    )) as Array<Record<string, unknown>>;
    return {
      summary: {
        started: attempts.length,
        expectedCandidates,
        notStarted: Math.max(expectedCandidates - attempts.length, 0),
        inProgress: attempts.length - submitted.length,
        submitted: submitted.length,
        pendingMarking: submitted.filter(
          (attempt) => attempt.manualGradingRequired,
        ).length,
        published: submitted.filter((attempt) => attempt.resultPublishedAt)
          .length,
        flagged: attempts.filter(
          (attempt) =>
            attempt.connectionLostCount > 0 ||
            attempt.visibilityHiddenCount > 0,
        ).length,
        averagePercent: percentages.length
          ? Math.round(
              (percentages.reduce((sum, value) => sum + value, 0) /
                percentages.length) *
                100,
            ) / 100
          : null,
        medianPercent,
        highestPercent: sortedPercentages.length
          ? sortedPercentages[sortedPercentages.length - 1]
          : null,
        lowestPercent: sortedPercentages[0] ?? null,
        passRate:
          percentages.length && exam.passMarkPercent !== null
            ? Math.round(
                (percentages.filter((value) => value >= exam.passMarkPercent!)
                  .length /
                  percentages.length) *
                  10000,
              ) / 100
            : null,
        completionRate: attempts.length
          ? Math.round((submitted.length / attempts.length) * 10000) / 100
          : 0,
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
        deadlineAt: new Date(
          new Date(attempt.startedAt).getTime() +
            exam.timeLimitMinutes * 60_000,
        ).toISOString(),
        connectionState:
          attempt.lastEventType === CbtAttemptEventType.CONNECTION_LOST
            ? 'offline'
            : 'online',
      })),
      scoreDistribution,
      questionAnalytics: questionAnalytics.map((item) => ({
        ...item,
        skippedCount: Number(item.attemptCount) - Number(item.answeredCount),
        incorrectCount: Number(item.answeredCount) - Number(item.correctCount),
        correctRate: Number(item.answeredCount)
          ? Math.round(
              (Number(item.correctCount) / Number(item.answeredCount)) * 10000,
            ) / 100
          : null,
      })),
    };
  }

  async getAttemptReview(attemptId: string) {
    const attempt = await this.attemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.exam', 'exam')
      .leftJoinAndSelect('attempt.applicant', 'applicant')
      .leftJoinAndSelect('attempt.answers', 'answer')
      .leftJoinAndSelect('answer.question', 'question')
      .addSelect('question.correctAnswer')
      .addSelect('question.explanation')
      .leftJoinAndSelect('attempt.events', 'event')
      .where('attempt.id = :attemptId', { attemptId })
      .orderBy('question.sortOrder', 'ASC')
      .addOrderBy('event.createdAt', 'ASC')
      .getOne();
    if (!attempt) throw new NotFoundException('Attempt not found');
    const student = attempt.studentId
      ? (
          (await this.dataSource.query(
            `SELECT student.registration_number AS "registrationNumber",
             TRIM(CONCAT(COALESCE(app_user.first_name, ''), ' ', COALESCE(app_user.last_name, ''))) AS "name"
           FROM students student
           JOIN users app_user ON app_user.id = student.user_id
           WHERE student.id = $1 LIMIT 1`,
            [attempt.studentId],
          )) as Array<{ registrationNumber: string; name: string }>
        )[0]
      : null;
    const metadata = this.attemptMetadata(attempt);
    const totalMarks = Number(
      metadata.totalMarks ??
        attempt.answers.reduce(
          (sum, answer) => sum + Number(answer.question.marks),
          0,
        ),
    );
    const score = Number(attempt.score ?? 0);
    return {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      candidate: attempt.applicant
        ? {
            name: attempt.applicant.fullName,
            email: attempt.applicant.email,
            type: 'applicant',
          }
        : {
            name: student?.name || 'Unknown student',
            registrationNumber: student?.registrationNumber ?? null,
            type: 'student',
          },
      exam: {
        id: attempt.exam.id,
        name: attempt.exam.name,
        passMarkPercent: attempt.exam.passMarkPercent,
      },
      score,
      totalMarks,
      percentage: totalMarks
        ? Math.round((score / totalMarks) * 10_000) / 100
        : 0,
      manualGradingRequired: Boolean(metadata.manualGradingRequired),
      gradingCompletedAt: metadata.gradingCompletedAt ?? null,
      resultPublishedAt: metadata.resultPublishedAt ?? null,
      answers: attempt.answers.map((answer) => ({
        id: answer.id,
        questionId: answer.questionId,
        response: answer.answerData,
        isCorrect: answer.isCorrect,
        marksAwarded:
          answer.marksAwarded === null ? null : Number(answer.marksAwarded),
        question: {
          body: answer.question.body,
          type: answer.question.type,
          marks: Number(answer.question.marks),
          options: answer.question.options,
          correctAnswer: answer.question.correctAnswer,
          explanation: answer.question.explanation,
        },
        grading: metadata.gradedAnswers?.[answer.questionId] ?? null,
      })),
      events: attempt.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        createdAt: event.createdAt,
        metadata: event.metadata,
      })),
    };
  }

  async acknowledgeAttemptEvent(eventId: string, userId: string) {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Attempt event not found');
    event.metadata = {
      ...(event.metadata ?? {}),
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId,
    };
    await this.eventRepository.save(event);
    return event;
  }

  async gradeAttemptAnswer(
    attemptId: string,
    questionId: string,
    dto: GradeCbtAnswerDto,
    graderId: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(CbtAttempt);
      const answerRepo = manager.getRepository(CbtAnswer);
      const attempt = await attemptRepo
        .createQueryBuilder('attempt')
        .setLock('pessimistic_write')
        .where('attempt.id = :attemptId', { attemptId })
        .getOne();
      if (!attempt) throw new NotFoundException('Attempt not found');
      if (attempt.status !== CbtAttemptStatus.SUBMITTED) {
        throw new ConflictException('Only submitted attempts can be marked');
      }
      const answer = await answerRepo.findOne({
        where: { attemptId, questionId },
        relations: { question: true },
      });
      if (!answer) throw new NotFoundException('Answer not found');
      const maximum = Number(answer.question.marks);
      if (dto.marksAwarded > maximum) {
        throw new BadRequestException(`Marks awarded cannot exceed ${maximum}`);
      }
      answer.marksAwarded = String(dto.marksAwarded);
      answer.isCorrect = dto.marksAwarded === maximum;
      await answerRepo.save(answer);

      const metadata = this.attemptMetadata(attempt);
      metadata.gradedAnswers = {
        ...(metadata.gradedAnswers ?? {}),
        [questionId]: {
          graderId,
          gradedAt: new Date().toISOString(),
          comment: dto.comment?.trim() || null,
        },
      };
      delete metadata.resultPublishedAt;
      delete metadata.resultPublishedBy;
      const pending = await answerRepo
        .createQueryBuilder('answer')
        .innerJoin('answer.question', 'question')
        .where('answer.attempt_id = :attemptId', { attemptId })
        .andWhere('answer.answer_data IS NOT NULL')
        .andWhere('answer.marks_awarded IS NULL')
        .getCount();
      metadata.manualGradingRequired = pending > 0;
      if (!pending) metadata.gradingCompletedAt = new Date().toISOString();
      const scoreRow = (await manager.query(
        `SELECT COALESCE(SUM(marks_awarded), 0)::numeric AS score
         FROM cbt_answers WHERE attempt_id = $1`,
        [attemptId],
      )) as Array<{ score: string }>;
      attempt.score = String(scoreRow[0]?.score ?? 0);
      attempt.metadata = metadata;
      await attemptRepo.save(attempt);
    });
    return this.getAttemptReview(attemptId);
  }

  async publishAttemptResult(attemptId: string, publisherId: string) {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status !== CbtAttemptStatus.SUBMITTED) {
      throw new ConflictException('Only submitted attempts have results');
    }
    const metadata = this.attemptMetadata(attempt);
    if (metadata.manualGradingRequired) {
      throw new ConflictException(
        'Complete manual marking before publishing this result',
      );
    }
    metadata.resultPublishedAt ??= new Date().toISOString();
    metadata.resultPublishedBy ??= publisherId;
    attempt.metadata = metadata;
    await this.attemptRepository.save(attempt);
    return this.getAttemptReview(attemptId);
  }

  async listApplicants(query: ListCbtApplicantsDto) {
    const period = await this.resolveCbtPeriod(query);
    const rows = (await this.dataSource.query(
      `
      SELECT applicant.id,
        applicant.full_name AS "fullName",
        applicant.email,
        applicant.phone,
        applicant.created_at AS "createdAt",
        applicant.admitted_at AS "admittedAt",
        applicant.student_id AS "studentId",
        intake.name AS "intakeName",
        MAX(attempt.started_at) AS "latestAttemptAt",
        MAX(academic_session.name) AS "sessionName",
        CASE WHEN $2::uuid IS NULL THEN NULL ELSE MAX(term.name::text) END AS "termName",
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
        BOOL_OR(
          attempt.status = 'submitted'
          AND COALESCE((attempt.metadata->>'manualGradingRequired')::boolean, false)
        ) AS "hasPendingMarking",
        BOOL_OR(exam.pass_mark_percent IS NOT NULL) AS "passMarkConfigured",
        (ARRAY_AGG(exam.name ORDER BY attempt.started_at DESC)
          FILTER (WHERE attempt.id IS NOT NULL))[1] AS "latestExamName"
      FROM cbt_applicants applicant
      JOIN cbt_intakes intake ON intake.id = applicant.intake_id
      JOIN cbt_attempts attempt ON attempt.applicant_id = applicant.id
      JOIN cbt_exams exam ON exam.id = attempt.exam_id
        AND exam.session_id = $1
        AND ($2::uuid IS NULL OR exam.term_id = $2)
      JOIN academic_sessions academic_session ON academic_session.id = exam.session_id
      LEFT JOIN terms term ON term.id = exam.term_id
      GROUP BY applicant.id, intake.name
      ORDER BY applicant.created_at DESC
    `,
      [period.sessionId, period.termId],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      ...row,
      bestPercentage:
        row.bestPercentage === null ? null : Number(row.bestPercentage),
    }));
  }

  async getApplicant(applicantId: string, query: ListCbtApplicantsDto) {
    const period = await this.resolveCbtPeriod(query);
    const applicant = await this.applicantRepository.findOne({
      where: { id: applicantId },
      relations: { intake: true, attempts: { exam: true } },
    });
    if (!applicant) throw new NotFoundException('Applicant not found');
    const scopedAttempts = applicant.attempts.filter(
      (attempt) =>
        attempt.exam.sessionId === period.sessionId &&
        (!period.termId || attempt.exam.termId === period.termId),
    );
    if (!scopedAttempts.length) {
      throw new NotFoundException(
        'Applicant has no examination record in the selected academic period',
      );
    }
    return {
      ...applicant,
      sessionName: period.sessionName,
      termName: period.termName,
      period: {
        sessionName: period.sessionName,
        termName: period.termName,
      },
      attempts: scopedAttempts.map((attempt) => {
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

  async admitApplicant(applicantId: string, query: ListCbtApplicantsDto) {
    const period = await this.resolveCbtPeriod(query);
    const applicant = await this.applicantRepository.findOne({
      where: { id: applicantId },
      relations: { attempts: { exam: true } },
    });
    if (!applicant) throw new NotFoundException('Applicant not found');
    const hasScopedAttempt = applicant.attempts.some(
      (attempt) =>
        attempt.exam.sessionId === period.sessionId &&
        (!period.termId || attempt.exam.termId === period.termId),
    );
    if (!hasScopedAttempt) {
      throw new NotFoundException(
        'Applicant has no examination record in the selected academic period',
      );
    }
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
        attempt.exam.sessionId === period.sessionId &&
        (!period.termId || attempt.exam.termId === period.termId) &&
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

  private async resolveCbtPeriod(query: ListCbtApplicantsDto) {
    const sessionRows = (await this.dataSource.query(
      query.sessionId
        ? `SELECT id, name FROM academic_sessions WHERE id = $1 AND deleted_at IS NULL LIMIT 1`
        : `SELECT id, name FROM academic_sessions WHERE status = 'Active' AND deleted_at IS NULL ORDER BY start_date DESC LIMIT 1`,
      query.sessionId ? [query.sessionId] : [],
    )) as Array<{ id: string; name: string }>;
    const sessionId = sessionRows[0]?.id;
    if (!sessionId) throw new NotFoundException('Academic session not found');
    if (query.scope === 'session') {
      return {
        sessionId,
        termId: null,
        sessionName: sessionRows[0].name,
        termName: null,
      };
    }

    const termRows = (await this.dataSource.query(
      query.termId
        ? `SELECT id, name FROM terms WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL LIMIT 1`
        : `SELECT id, name FROM terms WHERE session_id = $1 AND is_current = true AND deleted_at IS NULL LIMIT 1`,
      query.termId ? [query.termId, sessionId] : [sessionId],
    )) as Array<{ id: string; name: string }>;
    if (query.termId && !termRows[0]) {
      throw new BadRequestException(
        'The selected term does not belong to the session',
      );
    }
    return {
      sessionId,
      termId: termRows[0]?.id ?? null,
      sessionName: sessionRows[0].name,
      termName: termRows[0]?.name ?? null,
    };
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
      .andWhere('exam.status = :status', { status: CbtExamStatus.ACTIVE })
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
        relations: { questions: true, sections: true },
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
    const metadata = this.attemptMetadata(attempt);
    const reveal =
      attempt.status === CbtAttemptStatus.SUBMITTED &&
      !metadata.manualGradingRequired &&
      Boolean(exam.showResultImmediately || metadata.resultPublishedAt);
    return {
      ...this.buildAttemptPayload(attempt, exam),
      result: reveal ? this.resultPayload(attempt, exam) : null,
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

  async createSection(examId: string, dto: CreateCbtSectionDto) {
    await this.getDraftExam(examId);
    return this.sectionRepository.save(
      this.sectionRepository.create({
        examId,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        questionLimit: dto.questionLimit ?? null,
      }),
    );
  }

  async updateSection(sectionId: string, dto: UpdateCbtSectionDto) {
    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
    });
    if (!section) throw new NotFoundException('Examination section not found');
    await this.getDraftExam(section.examId);
    if (dto.title !== undefined) section.title = dto.title.trim();
    if (dto.instructions !== undefined) {
      section.instructions = dto.instructions.trim() || null;
    }
    if (dto.sortOrder !== undefined) section.sortOrder = dto.sortOrder;
    if (dto.questionLimit !== undefined) {
      section.questionLimit = dto.questionLimit;
    }
    return this.sectionRepository.save(section);
  }

  async deleteSection(sectionId: string) {
    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
    });
    if (!section) throw new NotFoundException('Examination section not found');
    await this.getDraftExam(section.examId);
    await this.sectionRepository.remove(section);
    return { id: sectionId };
  }

  async listQuestionBank(query: ListCbtQuestionBankDto) {
    const builder = this.questionRepository
      .createQueryBuilder('question')
      .addSelect('question.correctAnswer')
      .addSelect('question.explanation')
      .where('question.exam_id IS NULL')
      .andWhere('question.is_archived = false')
      .orderBy('question.created_at', 'DESC');
    if (query.search) {
      builder.andWhere(
        '(question.body ILIKE :search OR question.topic ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }
    if (query.type) {
      builder.andWhere('question.type = :type', { type: query.type });
    }
    if (query.difficulty) {
      builder.andWhere('question.difficulty = :difficulty', {
        difficulty: query.difficulty,
      });
    }
    if (query.topic) {
      builder.andWhere('question.topic ILIKE :topic', {
        topic: query.topic.trim(),
      });
    }
    return builder.take(250).getMany();
  }

  async createBankQuestion(dto: CreateCbtBankQuestionDto) {
    this.assertQuestion(dto as CreateCbtQuestionDto);
    return this.questionRepository.save(
      this.questionRepository.create({
        ...dto,
        examId: null,
        sectionId: null,
        sortOrder: 0,
        options: dto.options ?? null,
        correctAnswer: dto.correctAnswer ?? null,
        topic: dto.topic?.trim() || null,
        explanation: dto.explanation?.trim() || null,
        marks: String(dto.marks),
      }),
    );
  }

  async saveQuestionToBank(questionId: string) {
    const source = await this.getQuestionWithAnswerKey(questionId);
    if (!source.examId) {
      throw new ConflictException('Question is already in the question bank');
    }
    await this.getDraftExam(source.examId);
    return this.questionRepository.save(
      this.cloneQuestion(source, {
        examId: null,
        sectionId: null,
        sortOrder: 0,
      }),
    );
  }

  async importBankQuestion(
    examId: string,
    questionId: string,
    dto: ImportCbtBankQuestionDto,
  ) {
    await this.getDraftExam(examId);
    await this.assertSectionBelongsToExam(dto.sectionId, examId);
    const source = await this.getQuestionWithAnswerKey(questionId);
    if (source.examId) {
      throw new BadRequestException(
        'Question does not belong to the question bank',
      );
    }
    const sortOrder =
      dto.sortOrder ??
      (await this.questionRepository.count({ where: { examId } }));
    return this.questionRepository.save(
      this.cloneQuestion(source, {
        examId,
        sectionId: dto.sectionId ?? null,
        sortOrder,
      }),
    );
  }

  async publishExam(examId: string) {
    const exam = await this.getExamForManagement(examId);
    if (exam.status !== CbtExamStatus.REVIEW) {
      throw new ConflictException(
        'Submit the examination for review before making it available',
      );
    }
    this.validateExamForActivation(exam);
    exam.status =
      exam.availableFrom && exam.availableFrom.getTime() > Date.now()
        ? CbtExamStatus.SCHEDULED
        : CbtExamStatus.ACTIVE;
    return this.examRepository.save(exam);
  }

  async transitionExam(examId: string, dto: TransitionCbtExamDto) {
    const exam = await this.getExamForManagement(examId);
    const allowed: Record<CbtExamStatus, CbtExamStatus[]> = {
      [CbtExamStatus.DRAFT]: [CbtExamStatus.REVIEW, CbtExamStatus.ARCHIVED],
      [CbtExamStatus.REVIEW]: [
        CbtExamStatus.DRAFT,
        CbtExamStatus.SCHEDULED,
        CbtExamStatus.ACTIVE,
      ],
      [CbtExamStatus.SCHEDULED]: [
        CbtExamStatus.DRAFT,
        CbtExamStatus.ACTIVE,
        CbtExamStatus.CLOSED,
      ],
      [CbtExamStatus.ACTIVE]: [CbtExamStatus.CLOSED],
      [CbtExamStatus.CLOSED]: [CbtExamStatus.PUBLISHED, CbtExamStatus.ARCHIVED],
      [CbtExamStatus.PUBLISHED]: [CbtExamStatus.ARCHIVED],
      [CbtExamStatus.ARCHIVED]: [],
    };
    if (!allowed[exam.status].includes(dto.status)) {
      throw new ConflictException(
        `Cannot move an examination from ${exam.status} to ${dto.status}`,
      );
    }
    if (
      dto.status === CbtExamStatus.SCHEDULED ||
      dto.status === CbtExamStatus.ACTIVE
    ) {
      this.validateExamForActivation(exam);
    }
    if (
      dto.status === CbtExamStatus.SCHEDULED &&
      (!exam.availableFrom || exam.availableFrom.getTime() <= Date.now())
    ) {
      throw new BadRequestException(
        'A scheduled examination must have a future start date',
      );
    }
    if (
      dto.status === CbtExamStatus.ACTIVE &&
      exam.availableTo &&
      exam.availableTo.getTime() < Date.now()
    ) {
      throw new BadRequestException('This examination has already ended');
    }
    exam.status = dto.status;
    return this.examRepository.save(exam);
  }

  private validateExamForActivation(exam: CbtExam) {
    if (!exam.questions.length) {
      throw new BadRequestException(
        'Add at least one question before activating the examination',
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
  }

  async listStudentExams(studentId: string, query: ListCbtApplicantsDto) {
    await this.getStudent(studentId);
    const period = await this.resolveCbtPeriod(query);
    const enrollment = (await this.dataSource.query(
      `SELECT class_id AS "classId" FROM class_students
       WHERE student_id = $1 AND session_id = $2 AND is_active = true
       ORDER BY enrollment_date DESC LIMIT 1`,
      [studentId, period.sessionId],
    )) as Array<{ classId: string }>;
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
      .where('exam.status = :status', { status: CbtExamStatus.ACTIVE })
      .andWhere('exam.session_id = :sessionId', { sessionId: period.sessionId })
      .andWhere(
        '(exam.available_from IS NULL OR exam.available_from <= :now)',
        { now },
      )
      .andWhere(
        period.termId ? 'exam.term_id = :termId' : '1 = 1',
        period.termId ? { termId: period.termId } : {},
      )
      .andWhere('(exam.available_to IS NULL OR exam.available_to >= :now)', {
        now,
      })
      .andWhere(
        '(NOT EXISTS (SELECT 1 FROM cbt_exam_classes access WHERE access.exam_id = exam.id) OR class.id = :classId)',
        { classId: enrollment[0]?.classId ?? null },
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
          ...(() => {
            const metadata = this.attemptMetadata(attempt);
            const totalMarks = Number(metadata.totalMarks ?? 0);
            const resultVisible =
              attempt.status === CbtAttemptStatus.SUBMITTED &&
              !metadata.manualGradingRequired &&
              Boolean(exam.showResultImmediately || metadata.resultPublishedAt);
            const score = Number(attempt.score ?? 0);
            return {
              resultPublishedAt: metadata.resultPublishedAt ?? null,
              resultVisible,
              score: resultVisible ? score : null,
              totalMarks: resultVisible ? totalMarks : null,
              percentage:
                resultVisible && totalMarks
                  ? Math.round((score / totalMarks) * 10_000) / 100
                  : null,
            };
          })(),
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
        relations: { classes: true, questions: true, sections: true },
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
      relations: { questions: true, sections: true },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    const answers = await this.answerRepository.find({ where: { attemptId } });
    const metadata = this.attemptMetadata(attempt);
    const revealGrading =
      attempt.status === CbtAttemptStatus.SUBMITTED &&
      !metadata.manualGradingRequired &&
      Boolean(exam.showResultImmediately || metadata.resultPublishedAt);
    return {
      ...this.buildAttemptPayload(attempt, exam),
      result: revealGrading ? this.resultPayload(attempt, exam) : null,
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
      exam.status !== CbtExamStatus.ACTIVE
    ) {
      throw new ForbiddenException('External examination is not active');
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
      relations: { exam: { questions: true, sections: true } },
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
    if (exam.status !== CbtExamStatus.ACTIVE)
      throw new ForbiddenException('Examination is not active');
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
        sections: (exam.sections ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((section) => ({
            id: section.id,
            title: section.title,
            instructions: section.instructions,
            sortOrder: section.sortOrder,
          })),
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

  private resultPayload(attempt: CbtAttempt, exam: CbtExam) {
    const metadata = this.attemptMetadata(attempt);
    const totalMarks = Number(metadata.totalMarks ?? 0);
    const score = Number(attempt.score ?? 0);
    const percentage = totalMarks
      ? Math.round((score / totalMarks) * 10_000) / 100
      : 0;
    return {
      score,
      totalMarks,
      percentage,
      passed:
        exam.passMarkPercent === null
          ? null
          : percentage >= exam.passMarkPercent,
      publishedAt: metadata.resultPublishedAt ?? null,
    };
  }

  private attemptMetadata(attempt: CbtAttempt): ICbtAttemptMetadata {
    return { ...((attempt.metadata ?? {}) as ICbtAttemptMetadata) };
  }

  private async getQuestionWithAnswerKey(questionId: string) {
    const question = await this.questionRepository
      .createQueryBuilder('question')
      .addSelect('question.correctAnswer')
      .addSelect('question.explanation')
      .where('question.id = :questionId', { questionId })
      .getOne();
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  private cloneQuestion(
    source: CbtQuestion,
    destination: {
      examId: string | null;
      sectionId: string | null;
      sortOrder: number;
    },
  ) {
    return this.questionRepository.create({
      ...destination,
      type: source.type,
      body: source.body,
      options: source.options,
      correctAnswer: source.correctAnswer,
      marks: source.marks,
      topic: source.topic,
      difficulty: source.difficulty,
      explanation: source.explanation,
      isArchived: false,
    });
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
