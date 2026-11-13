import { PaginationMeta } from '@hng-sdk/orm';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import { ClassSubjectModelAction } from 'src/modules/class/model-actions';
import { ResultEventDto } from 'src/modules/notification/dto/event-trigger.dto';
import { ResultNotificationService } from 'src/modules/notification/services/result.notification.service';

import * as sysMsg from '../../../constants/system.messages';
import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { AcademicSessionModelAction } from '../../academic-session/model-actions/academic-session-actions';
import { TermModelAction } from '../../academic-term/model-actions';
import { TermService } from '../../academic-term/term.service';
import { writeActivityLog } from '../../activity-log/write-activity-log';
import { ClassStudentModelAction } from '../../class/model-actions/class-student.action';
import { ClassModelAction } from '../../class/model-actions/class.actions';
import { StudentSubjectEnrollmentService } from '../../class/services/student-subject-enrollment.service';
import { GradeSubmissionStatus } from '../../grade/entities';
import { GradeModelAction } from '../../grade/model-actions';
import { StudentModelAction } from '../../student/model-actions/student-actions';
import {
  ResultResponseDto,
  PaginatedClassResultsResponseDto,
  ListResultsQueryDto,
} from '../dto';
import { GetResultsQueryDto } from '../dto/get-results.dto';
import { Result, ResultSubjectLine } from '../entities';
import { IStudentGradeData, IStudentResultData } from '../interface';
import {
  ResultModelAction,
  ResultSubjectLineModelAction,
} from '../model-actions';
import {
  evaluateGradingPolicy,
  LEGACY_GRADING_POLICY,
} from '../policy/grading-policy';
import { GradingPolicyService } from '../policy/grading-policy.service';

function toNullableNumber(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

@Injectable()
export class ResultService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly resultModelAction: ResultModelAction,
    private readonly studentModelAction: StudentModelAction,
    private readonly resultSubjectLineModelAction: ResultSubjectLineModelAction,
    private readonly gradeModelAction: GradeModelAction,
    private readonly classModelAction: ClassModelAction,
    private readonly classStudentModelAction: ClassStudentModelAction,
    private readonly termModelAction: TermModelAction,
    private readonly academicSessionModelAction: AcademicSessionModelAction,
    @Optional()
    private readonly academicSessionService: AcademicSessionService | undefined,
    @Optional()
    private readonly termService: TermService | undefined,
    private readonly dataSource: DataSource,
    private readonly resultNotificationService: ResultNotificationService,
    private readonly classSubjectModelAction: ClassSubjectModelAction,
    private readonly gradingPolicyService: GradingPolicyService,
    private readonly subjectEnrollmentService: StudentSubjectEnrollmentService,
  ) {
    this.logger = baseLogger.child({ context: ResultService.name });
  }

  async getLatestPublication(resultId: string) {
    const result = await this.resultModelAction.get({
      identifierOptions: { id: resultId },
    });
    if (!result) throw new NotFoundException(sysMsg.RESULT_NOT_FOUND);
    const rows = await this.dataSource.query(
      `SELECT id, result_id, revision, snapshot, template_id, template_version,
              grading_policy_version_id, published_by, published_at, correction_reason
       FROM result_publications WHERE result_id = $1 ORDER BY revision DESC LIMIT 1`,
      [resultId],
    );
    return rows[0] ?? null;
  }

  async publishResult(
    resultId: string,
    actorId: string,
    correctionReason?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.query(
        'SELECT id FROM results WHERE id = $1 FOR UPDATE',
        [resultId],
      );
      if (!locked.length) throw new NotFoundException(sysMsg.RESULT_NOT_FOUND);
      const result = await manager.getRepository(Result).findOne({
        where: { id: resultId },
        relations: {
          student: { user: true },
          class: true,
          term: true,
          academicSession: true,
          subject_lines: { subject: true },
        },
      });
      if (!result) throw new NotFoundException(sysMsg.RESULT_NOT_FOUND);
      if (
        !result.generated_at ||
        !result.subject_lines?.length ||
        result.subject_count !== result.subject_lines.length ||
        result.average_score === null ||
        !result.grade_letter
      ) {
        throw new BadRequestException(
          'Generate a complete result with subject scores before publishing',
        );
      }
      const previous = await manager.query(
        'SELECT revision FROM result_publications WHERE result_id = $1 ORDER BY revision DESC LIMIT 1',
        [resultId],
      );
      const revision = previous.length ? Number(previous[0].revision) + 1 : 1;
      if (revision > 1 && !correctionReason?.trim()) {
        throw new BadRequestException(
          'A correction reason is required to publish a new revision',
        );
      }
      const school = await manager.query(
        'SELECT id, name, address, logo_url, primary_color FROM schools ORDER BY created_at LIMIT 1',
      );
      if (school.length !== 1) {
        throw new BadRequestException(
          'School identity is unavailable for publication',
        );
      }
      const policy = result.grading_policy_version_id
        ? await manager.query(
            'SELECT policy_key, version, definition FROM grading_policy_versions WHERE id = $1',
            [result.grading_policy_version_id],
          )
        : [];
      if (result.grading_policy_version_id && policy.length !== 1) {
        throw new BadRequestException(
          'Result grading policy version is unavailable',
        );
      }
      const snapshot = {
        result: this.transformToResponseDto(result),
        school: school[0],
        gradingPolicy: policy[0] ?? {
          policy_key: 'schoolbase-classic',
          version: 1,
          definition: LEGACY_GRADING_POLICY,
        },
      };
      const inserted = await manager.query(
        `INSERT INTO result_publications
          (result_id, revision, snapshot, grading_policy_version_id, template_id, template_version, published_by, correction_reason)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
         RETURNING id, result_id, revision, snapshot, template_id, template_version,
                   grading_policy_version_id, published_by, published_at, correction_reason`,
        [
          resultId,
          revision,
          JSON.stringify(snapshot),
          result.grading_policy_version_id,
          'schoolbase-current-default',
          1,
          actorId,
          correctionReason?.trim() ?? null,
        ],
      );
      return inserted[0];
    });
  }

  /**
   * Get all results
   */
  async getResults(query: GetResultsQueryDto) {
    const { page, limit, include_subject_lines } = query;
    const includeSubjectLines = include_subject_lines === 'true';

    const filters: Partial<GetResultsQueryDto> = {};

    const period = await this.resolveListPeriod(
      query.academic_session_id,
      query.term_id,
    );
    if (period.sessionId) filters.academic_session_id = period.sessionId;
    if (period.termId) filters.term_id = period.termId;
    if (query.class_id) filters.class_id = query.class_id;
    if (query.student_id) filters.student_id = query.student_id;

    // Fetch paginated results
    const results = await this.resultModelAction.list({
      filterRecordOptions: filters,
      relations: {
        student: { user: true },
        class: true,
        term: true,
        academicSession: true,
        ...(includeSubjectLines ? { subject_lines: { subject: true } } : {}),
      },
      order: { createdAt: 'DESC', term: { name: 'ASC' } },
      paginationPayload: { page, limit },
    });

    // Transform to response DTOs
    const transformedResults: ResultResponseDto[] = (results.payload ?? []).map(
      (result) => this.transformToResponseDto(result),
    );

    // Build pagination metadata
    const paginationMeta = {
      total: results.paginationMeta?.total ?? 0,
      totalPages: results.paginationMeta?.total_pages ?? 0,
      page: results.paginationMeta?.page ?? page,
      limit: results.paginationMeta?.limit ?? limit,
    };

    return {
      total: paginationMeta.total,
      totalPages: paginationMeta.totalPages,
      page: paginationMeta.page,
      limit: paginationMeta.limit,
      data: transformedResults,
    };
  }

  /**
   * Get results for a specific student
   */
  async getStudentResults(
    studentId: string,
    query: ListResultsQueryDto,
  ): Promise<{ data: ResultResponseDto[]; meta: Partial<PaginationMeta> }> {
    // Validate student exists
    const student = await this.studentModelAction.get({
      identifierOptions: { id: studentId },
    });

    if (!student || student.is_deleted) {
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    }

    const filterOptions: Record<string, string> = {
      student_id: studentId,
    };

    const period = await this.resolveListPeriod(
      query.academic_session_id,
      query.term_id,
    );
    if (period.termId) filterOptions.term_id = period.termId;
    if (period.sessionId) filterOptions.academic_session_id = period.sessionId;

    const page = query.page || 1;
    const limit = query.limit || 10;

    const results = await this.resultModelAction.list({
      filterRecordOptions: filterOptions,
      relations: {
        student: { user: true },
        class: true,
        term: true,
        academicSession: true,
        subject_lines: { subject: true },
      },
      order: { term: { name: 'ASC' }, createdAt: 'DESC' },
      paginationPayload: { page, limit },
    });

    const resultIds = results.payload.map((result) => result.id);
    const publications = resultIds.length
      ? await this.dataSource.query(
          `SELECT DISTINCT ON (result_id) result_id, snapshot
           FROM result_publications
           WHERE result_id = ANY($1::uuid[])
           ORDER BY result_id, revision DESC`,
          [resultIds],
        )
      : [];
    const publishedByResultId = new Map<string, ResultResponseDto>(
      publications.map(
        (publication: {
          result_id: string;
          snapshot: { result: ResultResponseDto };
        }) => [publication.result_id, publication.snapshot.result],
      ),
    );
    const transformedResults = results.payload.map(
      (result) =>
        publishedByResultId.get(result.id) ??
        this.transformToResponseDto(result),
    );

    return {
      data: transformedResults,
      meta: results.paginationMeta,
    };
  }

  private async resolveListPeriod(sessionId?: string, termId?: string) {
    if (sessionId || termId) return { sessionId, termId };
    if (!this.academicSessionService || !this.termService) return {};
    const [session, term] = await Promise.all([
      this.academicSessionService.activeSessions(),
      this.termService.getActiveTerm(),
    ]);
    return { sessionId: session.data.id, termId: term.id };
  }

  /* Generate results for all students in a class for a specific term
   */
  async generateClassResults(
    classId: string,
    termId: string,
    academicSessionId?: string,
    actorUserId?: string,
  ): Promise<{
    message: string;
    generated_count: number;
    result_ids: string[];
  }> {
    // Validate class exists
    const classEntity = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });

    if (!classEntity || classEntity.is_deleted) {
      throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
    }

    // Use class's session if not provided
    const sessionId = academicSessionId || classEntity.academicSession.id;
    if (sessionId !== classEntity.academicSession.id) {
      throw new BadRequestException(
        'Class does not belong to academic session',
      );
    }

    // Validate term and session
    const term = await this.termModelAction.get({
      identifierOptions: { id: termId },
      relations: { academicSession: true },
    });

    if (!term) {
      throw new NotFoundException(sysMsg.TERM_NOT_FOUND);
    }

    if (term.academicSession.id !== sessionId) {
      throw new BadRequestException(sysMsg.TERM_NOT_IN_SESSION);
    }

    const session = await this.academicSessionModelAction.get({
      identifierOptions: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(sysMsg.ACADEMIC_SESSION_NOT_FOUND);
    }

    const gradingPolicy = await this.gradingPolicyService.resolve(
      termId,
      classId,
    );

    // Get all active students in the class for this session
    const studentAssignments = await this.classStudentModelAction.list({
      filterRecordOptions: {
        class: { id: classId },
        session_id: sessionId,
        is_active: true,
      },
      relations: {
        student: { user: true },
      },
    });

    if (studentAssignments.payload.length === 0) {
      throw new BadRequestException(sysMsg.NO_ACTIVE_STUDENTS_IN_CLASS);
    }

    // Generate results for all students
    const studentResults: IStudentResultData[] = [];

    for (const assignment of studentAssignments.payload) {
      const studentId = assignment.student.id;
      const resultData = await this.computeStudentResultData(
        studentId,
        classId,
        termId,
        sessionId,
      );

      if (resultData && resultData.subject_count > 0) {
        studentResults.push(resultData);
      }
    }

    if (studentResults.length === 0) {
      // Check if there are SUBMITTED grades that need approval
      const submittedGrades = await this.gradeModelAction.list({
        filterRecordOptions: {
          submission: {
            class_id: classId,
            term_id: termId,
            academic_session_id: sessionId,
            status: GradeSubmissionStatus.SUBMITTED,
          },
        },
        paginationPayload: { page: 1, limit: 1 },
      });

      if (submittedGrades.payload.length > 0) {
        throw new BadRequestException(
          sysMsg.NO_APPROVED_GRADES_CLASS_SUBMITTED,
        );
      }

      // Check if there are any grades at all
      const anyGrades = await this.gradeModelAction.list({
        filterRecordOptions: {
          submission: {
            class_id: classId,
            term_id: termId,
            academic_session_id: sessionId,
          },
        },
        paginationPayload: { page: 1, limit: 1 },
      });

      if (anyGrades.payload.length > 0) {
        throw new BadRequestException(sysMsg.NO_APPROVED_GRADES_CLASS);
      }

      throw new BadRequestException(sysMsg.NO_GRADES_FOUND_CLASS);
    }

    // Calculate positions
    const resultsWithPositions = this.calculatePositions(studentResults);

    // this holds data needed for notifications
    const studentsToNotify: { result_id: string; student_id: string }[] = [];
    // Save all results in a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let generatedCount = 0;
      const resultIds: string[] = [];

      for (const resultData of resultsWithPositions) {
        // Check if result already exists
        const existingResult = await this.resultModelAction.get({
          identifierOptions: {
            student_id: resultData.student_id,
            class_id: resultData.class_id,
            term_id: termId,
            academic_session_id: sessionId,
          },
        });

        const result = existingResult || new Result();
        result.student_id = resultData.student_id;
        result.class_id = resultData.class_id;
        result.term_id = termId;
        result.academic_session_id = sessionId;
        result.total_score = resultData.total_score;
        result.average_score = resultData.average_score;
        const overallBand = evaluateGradingPolicy(
          resultData.average_score,
          gradingPolicy.definition,
        );
        result.grade_letter = overallBand?.grade ?? null;
        result.remark = overallBand?.remark ?? 'No grades available';
        result.grading_policy_version_id = gradingPolicy.id;
        result.position = resultData.position;
        result.subject_count = resultData.subject_count;
        result.generated_at = new Date();

        const savedResult = await queryRunner.manager.save(Result, result);
        resultIds.push(savedResult.id);

        // Delete existing subject lines if updating
        if (existingResult) {
          await queryRunner.manager.delete(ResultSubjectLine, {
            result_id: savedResult.id,
          });
        }

        // Create subject lines
        const subjectLines = resultData.grades.map((grade) => {
          const line = new ResultSubjectLine();
          line.result_id = savedResult.id;
          line.subject_id = grade.subject_id;
          line.ca_score = toNullableNumber(grade.ca_score);
          line.exam_score = toNullableNumber(grade.exam_score);
          line.total_score = toNullableNumber(grade.total_score);
          const subjectBand = evaluateGradingPolicy(
            grade.total_score,
            gradingPolicy.definition,
          );
          line.grade_letter = subjectBand?.grade ?? null;
          line.remark =
            grade.comment || subjectBand?.remark || 'No grades available';
          return line;
        });

        await queryRunner.manager.save(ResultSubjectLine, subjectLines);

        const expectedSubjects =
          await this.subjectEnrollmentService.expectedSubjectCount(
            resultData.student_id,
            classId,
            termId,
          );
        if (
          expectedSubjects > 0 &&
          resultData.subject_count === expectedSubjects
        ) {
          studentsToNotify.push({
            result_id: savedResult.id,
            student_id: resultData.student_id,
          });
        }

        generatedCount++;
      }

      if (actorUserId) {
        await writeActivityLog(queryRunner.manager, {
          actorUserId,
          entityType: 'RESULT',
          entityId: classId,
          action: 'PUBLISH',
          description: 'Class results generated and published',
          metadata: {
            term_id: termId,
            academic_session_id: sessionId,
            count: generatedCount,
          },
        });
      }
      await queryRunner.commitTransaction();
      await this.triggerResultNotifications(
        studentsToNotify,
        classId,
        termId,
        sessionId,
      );

      this.logger.info('Class results generated', {
        classId,
        termId,
        sessionId,
        count: generatedCount,
      });

      return {
        message: sysMsg.RESULT_GENERATED_SUCCESS(generatedCount),
        generated_count: generatedCount,
        result_ids: resultIds,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error generating class results', {
        error: error instanceof Error ? error.message : String(error),
        classId,
        termId,
      });
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async triggerResultNotifications(
    payloads: { result_id: string; student_id: string }[],
    classId: string,
    termId: string,
    sessionId: string,
  ) {
    if (payloads.length === 0) return;

    this.logger.info(
      `Triggering result notifications for ${payloads.length} students`,
    );

    const outcomes = await Promise.allSettled(
      payloads.map((payload) => {
        const eventDto: ResultEventDto = {
          result_id: payload.result_id,
          student_id: payload.student_id,
          class_id: classId,
          term_id: termId,
          academic_session_id: sessionId,
          is_published: true, // Since generation = publication
        };
        return this.resultNotificationService.handleResultPublication(eventDto);
      }),
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        this.logger.error('Error triggering result notifications', {
          error: outcome.reason,
        });
      }
    }
  }

  /**
   * Compute result data for a student from their grades
   */
  private async computeStudentResultData(
    studentId: string,
    classId: string,
    termId: string,
    sessionId: string,
  ): Promise<IStudentResultData | null> {
    // Fetch all approved grades for this student in this class/term/session
    const grades = await this.gradeModelAction.list({
      filterRecordOptions: {
        student_id: studentId,
        submission: {
          class_id: classId,
          term_id: termId,
          academic_session_id: sessionId,
          status: GradeSubmissionStatus.APPROVED,
        },
      },
      relations: {
        submission: {
          subject: true,
        },
      },
    });

    if (grades.payload.length === 0) {
      return null;
    }

    // Group grades by subject (in case there are multiple submissions)
    const subjectGradesMap = new Map<string, IStudentGradeData>();

    for (const grade of grades.payload) {
      const subjectId = grade.submission.subject.id;
      const subjectName = grade.submission.subject.name;

      // Use the latest grade if multiple exist (or sum/average as needed)
      // For now, we'll use the latest one
      if (!subjectGradesMap.has(subjectId)) {
        subjectGradesMap.set(subjectId, {
          subject_id: subjectId,
          subject_name: subjectName,
          ca_score: toNullableNumber(grade.ca_score),
          exam_score: toNullableNumber(grade.exam_score),
          total_score: toNullableNumber(grade.total_score),
          grade_letter: grade.grade_letter,
          comment: grade.comment,
        });
      }
    }

    const subjectGrades = Array.from(subjectGradesMap.values());

    // Calculate totals and averages
    const validScores = subjectGrades.filter(
      (g) => g.total_score !== null && g.total_score !== undefined,
    );

    if (validScores.length === 0) {
      return null;
    }

    const totalScore = validScores.reduce(
      (sum, g) => sum + Number(g.total_score || 0),
      0,
    );
    const averageScore = totalScore / validScores.length;
    const subjectCount = validScores.length;

    return {
      student_id: studentId,
      class_id: classId,
      grades: subjectGrades,
      total_score: totalScore,
      average_score: averageScore,
      subject_count: subjectCount,
    };
  }

  /**
   * Calculate positions for students based on average scores
   */
  private calculatePositions(
    studentResults: IStudentResultData[],
  ): (IStudentResultData & { position: number })[] {
    // Sort by average score descending
    const sorted = [...studentResults].sort(
      (a, b) => b.average_score - a.average_score,
    );

    // Assign positions (handle ties)
    const resultsWithPositions: (IStudentResultData & { position: number })[] =
      [];
    let currentPosition = 1;

    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].average_score < sorted[i - 1].average_score) {
        currentPosition = i + 1;
      }

      resultsWithPositions.push({
        ...sorted[i],
        position: currentPosition,
      });
    }

    return resultsWithPositions;
  }

  /**
   * Calculate position for a single student
   */
  private calculateStudentPosition(
    averageScore: number,
    classResults: IStudentResultData[],
  ): number {
    const sorted = [...classResults].sort(
      (a, b) => b.average_score - a.average_score,
    );

    const index = sorted.findIndex((r) => r.average_score === averageScore);
    if (index === -1) {
      return sorted.length + 1;
    }

    // Find first occurrence of this score
    let position = index + 1;
    for (let i = index - 1; i >= 0; i--) {
      if (sorted[i].average_score > averageScore) {
        break;
      }
      position = i + 1;
    }

    return position;
  }

  /**
   * Get student results for a class (for position calculation)
   */
  private async getStudentResultsForClass(
    classId: string,
    termId: string,
    sessionId: string,
  ): Promise<IStudentResultData[]> {
    const studentAssignments = await this.classStudentModelAction.list({
      filterRecordOptions: {
        class: { id: classId },
        session_id: sessionId,
        is_active: true,
      },
      relations: {
        student: true,
      },
    });

    const results: IStudentResultData[] = [];

    for (const assignment of studentAssignments.payload) {
      if (!assignment.student) {
        this.logger.warn('Student assignment missing student relation', {
          assignmentId: assignment.id,
        });
        continue;
      }

      const resultData = await this.computeStudentResultData(
        assignment.student.id,
        classId,
        termId,
        sessionId,
      );

      if (resultData && resultData.subject_count > 0) {
        results.push(resultData);
      }
    }

    return results;
  }

  /**
   * Get result by ID
   */
  async getResultById(resultId: string): Promise<ResultResponseDto> {
    const result = await this.resultModelAction.get({
      identifierOptions: { id: resultId },
      relations: {
        student: { user: true },
        class: true,
        term: true,
        academicSession: true,
        subject_lines: { subject: true },
      },
    });

    if (!result) {
      throw new NotFoundException(sysMsg.RESULT_NOT_FOUND);
    }

    return this.transformToResponseDto(result);
  }

  /**
   * Transform entity to response DTO
   */
  private transformToResponseDto(result: Result): ResultResponseDto {
    const student = result.student;
    const user = student?.user;

    return {
      id: result.id,
      student: {
        id: student?.id || '',
        registration_number: student?.registration_number || '',
        name: user
          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
          : undefined,
      },
      class: {
        id: result.class?.id || '',
        name: result.class?.name || '',
        arm: result.class?.arm,
      },
      term: {
        id: result.term?.id || '',
        name: result.term?.name || '',
      },
      academicSession: {
        id: result.academicSession?.id || '',
        name: result.academicSession?.name || '',
        academicYear: result.academicSession?.academicYear,
      },
      total_score: toNullableNumber(result.total_score),
      average_score: toNullableNumber(result.average_score),
      grade_letter: result.grade_letter,
      position: result.position,
      remark: result.remark,
      subject_count: result.subject_count,
      subject_lines:
        result.subject_lines?.map((line) => ({
          id: line.id,
          subject: {
            id: line.subject?.id || '',
            name: line.subject?.name || '',
          },
          ca_score: toNullableNumber(line.ca_score),
          exam_score: toNullableNumber(line.exam_score),
          total_score: toNullableNumber(line.total_score),
          grade_letter: line.grade_letter,
          remark: line.remark,
        })) || [],
      generated_at: result.generated_at,
      created_at: result.createdAt,
      updated_at: result.updatedAt,
    };
  }

  /**
   * Get class results for a specific term
   */
  async getClassResults(
    classId: string,
    termId: string,
    academicSessionId?: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedClassResultsResponseDto> {
    // Validate class
    const classEntity = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });

    if (!classEntity || classEntity.is_deleted) {
      throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
    }

    const sessionId = academicSessionId || classEntity.academicSession.id;

    // Validate term
    const term = await this.termModelAction.get({
      identifierOptions: { id: termId },
    });

    if (!term) {
      throw new NotFoundException(sysMsg.TERM_NOT_FOUND);
    }

    // Fetch paginated results and statistics in parallel
    const [results, statsQuery] = await Promise.all([
      this.resultModelAction.list({
        filterRecordOptions: {
          class_id: classId,
          term_id: termId,
          academic_session_id: sessionId,
        },
        relations: {
          student: { user: true },
          class: true,
          term: true,
          academicSession: true,
          subject_lines: { subject: true },
        },
        order: { position: 'ASC', average_score: 'DESC' },
        paginationPayload: { page, limit },
      }),
      // Calculate statistics across ALL results, not just current page
      this.dataSource
        .getRepository(Result)
        .createQueryBuilder('result')
        .select('MAX(result.average_score)', 'highest_score')
        .addSelect('MIN(result.average_score)', 'lowest_score')
        .addSelect('AVG(result.average_score)', 'class_average')
        .addSelect('COUNT(result.id)', 'total_students')
        .where('result.class_id = :classId', { classId })
        .andWhere('result.term_id = :termId', { termId })
        .andWhere('result.academic_session_id = :sessionId', { sessionId })
        .getRawOne(),
    ]);

    const transformedResults = results.payload.map((result) =>
      this.transformToResponseDto(result),
    );

    // Use aggregated statistics from the entire dataset
    const classStatistics =
      statsQuery && statsQuery.total_students > 0
        ? {
            highest_score: statsQuery.highest_score
              ? Number(statsQuery.highest_score)
              : null,
            lowest_score: statsQuery.lowest_score
              ? Number(statsQuery.lowest_score)
              : null,
            class_average: statsQuery.class_average
              ? Number(statsQuery.class_average)
              : null,
            total_students: Number(statsQuery.total_students),
          }
        : null;

    const paginationMeta = {
      total: results.paginationMeta?.total ?? 0,
      page: results.paginationMeta?.page ?? page,
      limit: results.paginationMeta?.limit ?? limit,
      total_pages: results.paginationMeta?.total_pages ?? 0,
      has_next: results.paginationMeta?.has_next ?? false,
      has_previous: results.paginationMeta?.has_previous ?? false,
    };

    return {
      message: sysMsg.RESULTS_RETRIEVED_SUCCESS,
      data: {
        results: transformedResults,
        class_statistics: classStatistics,
      },
      pagination: paginationMeta,
    };
  }
}
