import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../../constants/system.messages';
import { ClassSubject } from '../../class/entities/class-subject.entity';
import { StudentSubjectEnrollmentService } from '../../class/services/student-subject-enrollment.service';
import {
  evaluateGradingPolicy,
  IGradingPolicyDefinition,
  LEGACY_GRADING_POLICY,
} from '../../result/policy/grading-policy';
import { GradingPolicyService } from '../../result/policy/grading-policy.service';
import { UserRole } from '../../shared/enums';
import { StudentModelAction } from '../../student/model-actions';
import { GradeResponseDto, UpdateGradeDto } from '../dto';
import { Grade, GradeSubmissionStatus } from '../entities';
import { GradeModelAction } from '../model-actions';

@Injectable()
export class GradeService {
  private readonly logger: Logger;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly gradeModelAction: GradeModelAction,
    private readonly dataSource: DataSource,
    private readonly subjectEnrollmentService: StudentSubjectEnrollmentService,
    private readonly studentModelAction: StudentModelAction,
    private readonly gradingPolicyService: GradingPolicyService,
  ) {
    this.logger = baseLogger.child({ context: GradeService.name });
  }

  /**
   * Calculate grade letter based on total score
   */
  private calculateGradeLetter(
    totalScore: number,
    definition: IGradingPolicyDefinition = LEGACY_GRADING_POLICY,
  ): string {
    const grade = evaluateGradingPolicy(totalScore, definition)?.grade;
    if (!grade)
      throw new BadRequestException('Total score must be between 0 and 100');
    return grade;
  }

  /**
   * Update a single grade within a submission
   */
  async updateGrade(
    teacherId: string,
    gradeId: string,
    updateDto: UpdateGradeDto,
  ): Promise<GradeResponseDto> {
    const grade = await this.gradeModelAction.get({
      identifierOptions: { id: gradeId },
      relations: { submission: true, student: { user: true } },
    });

    if (!grade) {
      throw new NotFoundException(sysMsg.GRADE_NOT_FOUND);
    }

    // Verify teacher owns this submission
    if (grade.submission.teacher_id !== teacherId) {
      throw new ForbiddenException(sysMsg.UNAUTHORIZED_GRADE_ACCESS);
    }

    const currentAssignment = await this.dataSource
      .getRepository(ClassSubject)
      .findOne({
        where: {
          class: { id: grade.submission.class_id },
          subject: { id: grade.submission.subject_id },
          teacher: { id: teacherId },
        },
      });
    if (!currentAssignment) {
      throw new ForbiddenException(sysMsg.GRADE_TEACHER_NOT_ASSIGNED);
    }

    if (
      !(await this.subjectEnrollmentService.isStudentEligible(
        grade.submission.class_id,
        grade.submission.subject_id,
        grade.submission.term_id,
        grade.student_id,
      ))
    ) {
      throw new ForbiddenException(
        'Student is not enrolled in this subject for the selected term',
      );
    }

    // Check if submission is editable
    if (grade.submission.status === GradeSubmissionStatus.APPROVED) {
      throw new BadRequestException(sysMsg.GRADE_ALREADY_APPROVED);
    }

    if (grade.submission.status === GradeSubmissionStatus.SUBMITTED) {
      throw new BadRequestException(sysMsg.GRADE_ALREADY_SUBMITTED);
    }

    // Calculate new scores
    const caScore = updateDto.ca_score ?? grade.ca_score;
    const examScore = updateDto.exam_score ?? grade.exam_score;
    const totalScore =
      caScore !== null && examScore !== null
        ? Number(caScore) + Number(examScore)
        : null;
    const policy = await this.gradingPolicyService.resolve(
      grade.submission.term_id,
      grade.submission.class_id,
    );
    const gradeLetter =
      totalScore !== null
        ? this.calculateGradeLetter(totalScore, policy.definition)
        : null;

    const updatedGrade = await this.gradeModelAction.update({
      identifierOptions: { id: gradeId },
      updatePayload: {
        ca_score: caScore,
        exam_score: examScore,
        total_score: totalScore,
        grade_letter: gradeLetter,
        grading_policy_version_id: policy.id,
        comment: updateDto.comment ?? grade.comment,
      },
      transactionOptions: { useTransaction: false },
    });

    this.logger.info(sysMsg.GRADE_UPDATED, {
      gradeId,
      teacherId,
      studentId: grade.student_id,
    });

    return this.transformGradeToResponse(updatedGrade, grade.student);
  }

  /**
   * Get grades for a student (for students and parents)
   */
  async getStudentGrades(
    studentId: string,
    user: {
      id: string;
      student_id?: string;
      parent_id?: string;
      roles: UserRole[];
    },
  ) {
    // Authorization
    if (user.roles.includes(UserRole.STUDENT)) {
      if (user.student_id !== studentId) {
        throw new ForbiddenException(sysMsg.UNAUTHORIZED_GRADE_ACCESS);
      }
    } else if (user.roles.includes(UserRole.PARENT)) {
      const student = await this.studentModelAction.get({
        identifierOptions: {
          id: studentId,
        },
        relations: { parent: true },
      });

      if (!student || !student.parent || student.parent.id !== user.parent_id) {
        throw new ForbiddenException(sysMsg.UNAUTHORIZED_GRADE_ACCESS);
      }
    } else {
      throw new ForbiddenException(sysMsg.UNAUTHORIZED_GRADE_ACCESS);
    }

    // Fetch only approved grades
    const grades = await this.gradeModelAction.list({
      filterRecordOptions: {
        student_id: studentId,
        submission: { status: GradeSubmissionStatus.APPROVED },
      },
      relations: {
        submission: {
          class: true,
          subject: true,
          term: true,
          teacher: { user: true },
        },
      },
    });

    if (grades.payload.length === 0) {
      return {
        message: 'No grades found for this student.',
        data: [],
      };
    }

    // Transform data
    const transformedGrades = grades.payload.map((grade) => ({
      id: grade.id,
      class: grade.submission.class
        ? {
            id: grade.submission.class.id,
            name: grade.submission.class.name,
            arm: grade.submission.class.arm,
          }
        : null,
      subject: grade.submission.subject
        ? {
            id: grade.submission.subject.id,
            name: grade.submission.subject.name,
          }
        : null,
      term: grade.submission.term
        ? {
            id: grade.submission.term.id,
            name: grade.submission.term.name,
          }
        : null,
      teacher: grade.submission.teacher
        ? {
            id: grade.submission.teacher.id,
            name: `${grade.submission.teacher.user?.first_name || ''} ${grade.submission.teacher.user?.last_name || ''}`.trim(),
          }
        : null,
      ca_score: grade.ca_score,
      exam_score: grade.exam_score,
      total_score: grade.total_score,
      grade_letter: grade.grade_letter,
      comment: grade.comment,
      submitted_at: grade.submission.submitted_at,
    }));

    return {
      message: sysMsg.GRADES_FETCHED,
      data: transformedGrades,
    };
  }

  /**
   * Transform grade to response DTO
   */
  private transformGradeToResponse(
    grade: Grade,
    student: Grade['student'] | null,
  ): GradeResponseDto {
    return {
      id: grade.id,
      student: student
        ? {
            id: student.id,
            name: `${student.user?.first_name || ''} ${student.user?.last_name || ''}`.trim(),
            registration_number: student.registration_number,
          }
        : null,
      ca_score: grade.ca_score,
      exam_score: grade.exam_score,
      total_score: grade.total_score,
      grade_letter: grade.grade_letter,
      comment: grade.comment,
    } as GradeResponseDto;
  }
}
