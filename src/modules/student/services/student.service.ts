import { PaginationMeta } from '@hng-sdk/orm';
import {
  ConflictException,
  HttpStatus,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource, Like } from 'typeorm';
import { Logger } from 'winston';

import { SessionStatus } from 'src/modules/academic-session/entities/academic-session.entity';
import { AcademicSessionModelAction } from 'src/modules/academic-session/model-actions/academic-session-actions';
import { ClassStudentModelAction } from 'src/modules/class/model-actions/class-student.action';
import { ClassModelAction } from 'src/modules/class/model-actions/class.actions';

import * as sysMsg from '../../../constants/system.messages';
import { AccountCreationService } from '../../email/account-creation.service';
import { IUserPayload } from '../../parent/parent.service';
import { UserRole } from '../../shared/enums';
import { FileService } from '../../shared/file/file.service';
import { generateResetToken, hashPassword } from '../../shared/utils';
import { UserModelAction } from '../../user/model-actions/user-actions';
import {
  CreateStudentDto,
  StudentResponseDto,
  ListStudentsDto,
  PatchStudentDto,
  StudentProfileResponseDto,
} from '../dto';
import {
  StudentGrowthInterval,
  StudentGrowthQueryDto,
  StudentGrowthReportResponseDto,
} from '../dto/student.growth.dto';
import { Student } from '../entities';
import { StudentModelAction } from '../model-actions';

@Injectable()
export class StudentService {
  private readonly logger: Logger;
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly userModelAction: UserModelAction,
    private readonly studentModelAction: StudentModelAction,
    private readonly dataSource: DataSource,
    private readonly fileService: FileService,
    private readonly classStudentModelAction: ClassStudentModelAction,
    private readonly classModelAction: ClassModelAction,
    private readonly academicSessionModelAction: AcademicSessionModelAction,
    private readonly accountCreationService: AccountCreationService,
  ) {
    this.logger = baseLogger.child({ context: StudentService.name });
  }

  async create(
    createStudentDto: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    const existingUser = await this.userModelAction.get({
      identifierOptions: { email: createStudentDto.email },
    });

    if (existingUser) {
      this.logger.warn(
        `Attempt to create student with existing email: ${createStudentDto.email}`,
      );
      throw new ConflictException(sysMsg.STUDENT_EMAIL_CONFLICT);
    }
    const registration_number = await this.generateStudentNumber();

    const existingStudent = await this.studentModelAction.get({
      identifierOptions: { registration_number },
    });

    if (existingStudent) {
      this.logger.warn(
        `Attempt to create student with existing registration number: ${registration_number}`,
      );
      throw new ConflictException(sysMsg.STUDENT_REGISTRATION_NUMBER_CONFLICT);
    }

    const hashedPassword = await hashPassword(createStudentDto.password);

    let photo_url: string | undefined = undefined;
    if (createStudentDto.photo_url) {
      photo_url = this.fileService.validatePhotoUrl(createStudentDto.photo_url);
    }

    const { resetToken, resetTokenExpiry } = generateResetToken(24);

    const { savedUser, savedStudent } = await this.dataSource.transaction(
      async (manager) => {
        const savedUser = await this.userModelAction.create({
          createPayload: {
            first_name: createStudentDto.first_name,
            last_name: createStudentDto.last_name,
            middle_name: createStudentDto.middle_name,
            email: createStudentDto.email,
            phone: createStudentDto.phone,
            gender: createStudentDto.gender,
            dob: new Date(createStudentDto.date_of_birth),
            homeAddress: createStudentDto.home_address,
            password: hashedPassword,
            role: [UserRole.STUDENT],
            is_active: createStudentDto.is_active ?? true,
            reset_token: resetToken,
            reset_token_expiry: resetTokenExpiry,
          },
          transactionOptions: {
            useTransaction: true,
            transaction: manager,
          },
        });

        const savedStudent = await this.studentModelAction.create({
          createPayload: {
            user: { id: savedUser.id },
            registration_number,
            photo_url: photo_url,
          },
          transactionOptions: {
            useTransaction: true,
            transaction: manager,
          },
        });

        this.logger.info(sysMsg.RESOURCE_CREATED, {
          studentId: savedStudent.id,
          registration_number,
          email: savedUser.email,
        });

        return { savedUser, savedStudent };
      },
    );

    await this.accountCreationService.sendAccountCreationEmail(
      `${savedUser.first_name} ${savedUser.last_name}`,
      savedUser.email,
      createStudentDto.password,
      UserRole.STUDENT,
      resetToken,
    );

    return new StudentResponseDto(
      savedStudent,
      savedUser,
      sysMsg.STUDENT_CREATED,
    );
  }

  // --- FIND ALL (with pagination and search) ---
  async findAll(listStudentsDto: ListStudentsDto): Promise<{
    message: string;
    status_code: number;
    data: StudentResponseDto[];
    meta: Partial<PaginationMeta>;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      unassigned,
      class_id,
    } = listStudentsDto;
    const activeSession = listStudentsDto.session_id
      ? { id: listStudentsDto.session_id }
      : await this.academicSessionModelAction.get({
          identifierOptions: { status: SessionStatus.ACTIVE },
        });
    const sessionId = activeSession?.id;

    // Use query builder if we have search or unassigned filter (complex filtering)
    // Otherwise use model action for simple filtering
    const { payload: students, paginationMeta } =
      sessionId || search || unassigned !== undefined || class_id
        ? await this.searchStudentsWithModelAction(
            search || '',
            page,
            limit,
            unassigned,
            sessionId,
            class_id,
          )
        : await this.studentModelAction.list({
            filterRecordOptions: {
              is_deleted: false,
            },
            relations: { user: true, stream: true },
            paginationPayload: { page, limit },
            order: { createdAt: 'DESC' },
          });

    const data = students.map(
      (student) => new StudentResponseDto(student, student.user),
    );

    this.logger.info(`Fetched ${data.length} students`, {
      searchTerm: search,
      unassigned,
      sessionId,
      classId: class_id,
      page,
      limit,
      total: paginationMeta.total,
    });

    return {
      message: sysMsg.STUDENTS_FETCHED,
      status_code: 200,
      data,
      meta: paginationMeta,
    };
  }

  // --- FIND ONE ---
  async findOne(id: string): Promise<StudentResponseDto> {
    const student = await this.studentModelAction.get({
      identifierOptions: { id },
      relations: { user: true, stream: true },
    });

    if (!student || student.is_deleted) {
      this.logger.warn(`Student not found with ID: ${id}`);
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    }

    return new StudentResponseDto(
      student,
      student.user,
      sysMsg.STUDENT_FETCHED,
    );
  }

  async update(
    id: string,
    updateStudentDto: PatchStudentDto,
  ): Promise<StudentResponseDto> {
    const existingStudent = await this.studentModelAction.get({
      identifierOptions: { id },
      relations: {
        user: true,
      },
    });
    if (!existingStudent || existingStudent.is_deleted)
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    if (updateStudentDto.email) {
      const existingUser = await this.userModelAction.get({
        identifierOptions: { email: updateStudentDto.email },
      });

      if (existingUser && existingUser.id !== existingStudent.user.id) {
        this.logger.warn(
          `Attempt to update student with existing email: ${updateStudentDto.email}`,
        );
        throw new ConflictException(sysMsg.STUDENT_EMAIL_CONFLICT);
      }
    }
    return this.dataSource.transaction(async (manager) => {
      const updatedUser = await this.userModelAction.update({
        identifierOptions: { id: existingStudent.user.id },
        updatePayload: {
          first_name: updateStudentDto.first_name,
          last_name: updateStudentDto.last_name,
          middle_name: updateStudentDto.middle_name,
          email: updateStudentDto.email,
          phone: updateStudentDto.phone,
          gender: updateStudentDto.gender,
          dob: updateStudentDto.date_of_birth
            ? new Date(updateStudentDto.date_of_birth)
            : undefined,
          homeAddress: updateStudentDto.home_address,
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });

      let student = existingStudent;

      if (updateStudentDto.photo_url) {
        const photo_url = this.fileService.validatePhotoUrl(
          updateStudentDto.photo_url,
        );
        student = await this.studentModelAction.update({
          identifierOptions: { id },
          updatePayload: {
            photo_url: photo_url,
          },
          transactionOptions: {
            useTransaction: true,
            transaction: manager,
          },
        });
      }

      this.logger.info(sysMsg.RESOURCE_UPDATED, {
        studentId: id,
      });

      return new StudentResponseDto(
        student,
        updatedUser,
        sysMsg.STUDENT_UPDATED,
      );
    });
  }

  async remove(id: string) {
    const existingStudent = await this.studentModelAction.get({
      identifierOptions: { id },
      relations: {
        user: true,
      },
    });
    if (!existingStudent || existingStudent.is_deleted)
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    return this.dataSource.transaction(async (manager) => {
      await this.userModelAction.update({
        identifierOptions: { id: existingStudent.user.id },
        updatePayload: {
          deleted_at: new Date(),
          is_active: false,
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });

      await this.studentModelAction.update({
        identifierOptions: { id },
        updatePayload: {
          is_deleted: true,
          deleted_at: new Date(),
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });

      this.logger.info(sysMsg.RESOURCE_DELETED, {
        studentId: id,
      });

      return { message: sysMsg.STUDENT_DELETED };
    });
  }

  // --- SEARCH STUDENTS (private method) ---
  /**
   * Search and filter students using query builder.
   * Supports search by name/email/registration and filtering by assignment status.
   *
   * @param search - Search term (optional)
   * @param page - Page number
   * @param limit - Items per page
   * @param unassigned - Filter by assignment status: true = unassigned only, false = assigned only, undefined = all
   * @returns Paginated list of students
   */
  private async searchStudentsWithModelAction(
    search: string,
    page: number = 1,
    limit: number = 10,
    unassigned?: boolean,
    sessionId?: string,
    classId?: string,
  ): Promise<{
    payload: Student[];
    paginationMeta: Partial<PaginationMeta>;
  }> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.studentModelAction['repository']
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.stream', 'stream')
      .orderBy('student.createdAt', 'DESC')
      .where('student.is_deleted IS NOT TRUE');

    if (sessionId) {
      queryBuilder.leftJoin(
        'class_students',
        'period_enrollment',
        'period_enrollment.student_id = student.id AND period_enrollment.session_id = :sessionId AND period_enrollment.is_active = true',
        { sessionId },
      );
    }
    if (classId) {
      queryBuilder.andWhere('period_enrollment.class_id = :classId', {
        classId,
      });
    }

    // Add search condition
    if (search && search.trim()) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search OR student.registration_number ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Add unassigned filter
    if (unassigned === true) {
      queryBuilder.andWhere(
        sessionId
          ? 'period_enrollment.student_id IS NULL'
          : 'student.current_class_id IS NULL',
      );
    } else if (unassigned === false) {
      queryBuilder.andWhere(
        sessionId
          ? 'period_enrollment.student_id IS NOT NULL'
          : 'student.current_class_id IS NOT NULL',
      );
    }

    const total = await queryBuilder.getCount();
    const payload = await queryBuilder.skip(skip).take(limit).getMany();

    const paginationMeta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return { payload, paginationMeta };
  }

  /**
   * Generate a unique Student Number in the format STU-YYYY-XXXX
   * where YYYY is the current year and XXXX is a 4-digit sequential number.
   */
  private async generateStudentNumber(): Promise<string> {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `STU-${currentYear}-`;

    // Fetch the last student number for this year
    const lastRecord = await this.studentModelAction.find({
      findOptions: {
        registration_number: Like(`${yearPrefix}%`),
      },
      transactionOptions: { useTransaction: false },
      paginationPayload: { limit: 1, page: 1 },
      order: { registration_number: 'DESC' },
    });

    let nextSequence = 1;

    if (lastRecord?.payload?.length > 0) {
      const lastStudentNumber = lastRecord.payload[0].registration_number;

      if (lastStudentNumber) {
        const parts = lastStudentNumber.split('-');
        if (parts.length === 3) {
          const lastSeq = parseInt(parts[2], 10);
          if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
          }
        }
      }
    }

    const sequenceStr = String(nextSequence).padStart(4, '0');
    return `${yearPrefix}${sequenceStr}`;
  }

  //student growth api

  async getStudentGrowthReport(
    query: StudentGrowthQueryDto,
  ): Promise<StudentGrowthReportResponseDto> {
    const session = query.session_id
      ? await this.academicSessionModelAction.get({
          identifierOptions: { id: query.session_id },
        })
      : (
          await this.academicSessionModelAction.find({
            findOptions: { status: SessionStatus.ACTIVE },
            transactionOptions: { useTransaction: false },
          })
        ).payload?.[0];

    if (!session) throw new NotFoundException('Academic session not found');

    const interval = query.interval || StudentGrowthInterval.MONTH;
    const terms = (await this.dataSource.query(
      `SELECT id, name, start_date AS "startDate", end_date AS "endDate"
       FROM terms
       WHERE session_id = $1 AND deleted_at IS NULL
       ORDER BY start_date ASC`,
      [session.id],
    )) as Array<{
      id: string;
      name: string;
      startDate: string;
      endDate: string;
    }>;

    const selectedTerm = query.term_id
      ? terms.find((term) => term.id === query.term_id)
      : undefined;
    if (query.term_id && !selectedTerm) {
      throw new NotFoundException(
        'Academic term not found in selected session',
      );
    }

    const scopeStart = new Date(selectedTerm?.startDate || session.startDate);
    const scopeEnd = new Date(selectedTerm?.endDate || session.endDate);
    const periods: Array<{ label: string; start: Date; end: Date }> = [];

    if (interval === StudentGrowthInterval.TERM) {
      const scopedTerms = selectedTerm ? [selectedTerm] : terms;
      for (const term of scopedTerms) {
        periods.push({
          label: term.name,
          start: new Date(term.startDate),
          end: new Date(term.endDate),
        });
      }
    } else {
      const cursor = new Date(
        Date.UTC(scopeStart.getUTCFullYear(), scopeStart.getUTCMonth(), 1),
      );
      while (cursor <= scopeEnd) {
        const monthStart = new Date(cursor);
        const monthEnd = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
        );
        periods.push({
          label: monthStart.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          start: monthStart < scopeStart ? scopeStart : monthStart,
          end: monthEnd > scopeEnd ? scopeEnd : monthEnd,
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    const enrollments = (await this.dataSource.query(
      `SELECT student_id AS "studentId", MIN(enrollment_date) AS "enrollmentDate"
       FROM class_students cs
       INNER JOIN students student ON student.id = cs.student_id
       WHERE cs.session_id = $1
         AND cs.is_active = true
         AND student.is_deleted = false
       GROUP BY student_id`,
      [session.id],
    )) as Array<{ studentId: string; enrollmentDate: string }>;

    const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
    const report = periods.map((period) => {
      const startTime = period.start.getTime();
      const endTime = new Date(
        toDateOnly(period.end) + 'T23:59:59.999Z',
      ).getTime();

      return {
        label: period.label,
        start_date: toDateOnly(period.start),
        end_date: toDateOnly(period.end),
        new_students: enrollments.filter(({ enrollmentDate }) => {
          const enrolledAt = new Date(enrollmentDate).getTime();
          return enrolledAt >= startTime && enrolledAt <= endTime;
        }).length,
        cumulative_students: enrollments.filter(
          ({ enrollmentDate }) => new Date(enrollmentDate).getTime() <= endTime,
        ).length,
      };
    });

    return {
      message: sysMsg.OPERATION_SUCCESSFUL,
      status_code: HttpStatus.OK,
      data: {
        session_id: session.id,
        academic_year: session.name,
        term_id: selectedTerm?.id,
        interval,
        report,
      },
    };
  }

  /**
   * Retrieves the profile of the currently authenticated student.
   * @param studentId - The ID of the student.
   * @returns The student's complete profile.
   * @throws {NotFoundException} If no student profile is linked to the user account.
   */
  async getMyProfile(
    studentId: string,
    authUser: IUserPayload,
  ): Promise<StudentProfileResponseDto> {
    const student = await this.studentModelAction.get({
      identifierOptions: { id: studentId },
      relations: {
        user: true,
        stream: {
          class: {
            academicSession: true,
            teacher_assignment: true,
            classSubjects: true,
            timetable: {
              schedules: true,
            },
          },
        },
      },
    });

    if (!student || student.is_deleted) {
      this.logger.warn(`Student profile not found with ID: ${studentId}`);
      throw new NotFoundException(sysMsg.STUDENT_NOT_FOUND);
    }

    // --- Ownership Check ---
    // A student can only access their own profile.
    if (
      authUser.roles.includes(UserRole.STUDENT) &&
      student.user.id !== authUser.id
    ) {
      this.logger.warn(
        `Forbidden access attempt to student profile ${studentId} by user ${authUser.id}`,
      );
      throw new ForbiddenException(sysMsg.FORBIDDEN);
    }

    this.logger.info(`Fetched student profile for student ID: ${studentId}`);

    return new StudentProfileResponseDto(
      student,
      student.user,
      sysMsg.PROFILE_RETRIEVED,
    );
  }
}
