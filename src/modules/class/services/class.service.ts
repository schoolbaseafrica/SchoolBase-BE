import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../../constants/system.messages';
import {
  AcademicSession,
  SessionStatus,
} from '../../academic-session/entities/academic-session.entity';
import { AcademicSessionModelAction } from '../../academic-session/model-actions/academic-session-actions';
import { EventAction } from '../../notification/dto/event-trigger.dto';
import { NotificationService } from '../../notification/services/notification.service';
import {
  NotificationMetadata,
  NotificationType,
} from '../../notification/types/notification.types';
import { Stream } from '../../stream/entities/stream.entity';
import { StudentModelAction } from '../../student/model-actions/student-actions';
import { TeacherModelAction } from '../../teacher/model-actions/teacher-actions';
import {
  AssignStudentsToClassDto,
  ClassResponseDto,
  CreateClassDto,
  StudentAssignmentResponseDto,
  TeacherAssignmentResponseDto,
  UpdateClassDto,
} from '../dto';
import { ClassStudent } from '../entities/class-student.entity';
import { ClassStudentModelAction } from '../model-actions/class-student.action';
import { ClassTeacherModelAction } from '../model-actions/class-teacher.action';
import { ClassModelAction } from '../model-actions/class.actions';
import {
  ICreateClassResponse,
  IGetClassByIdResponse,
  IUpdateClassResponse,
} from '../types/base-response.interface';

import { ClassStudentValidationService } from './class-student-validation.service';

@Injectable()
export class ClassService {
  private readonly logger: Logger;
  constructor(
    private readonly classModelAction: ClassModelAction,
    private readonly sessionModelAction: AcademicSessionModelAction,
    private readonly classTeacherModelAction: ClassTeacherModelAction,
    private readonly classStudentModelAction: ClassStudentModelAction,
    private readonly studentModelAction: StudentModelAction,
    private readonly academicSessionModelAction: AcademicSessionModelAction,
    private readonly teacherModelAction: TeacherModelAction,
    private readonly dataSource: DataSource,
    private readonly classStudentValidationService: ClassStudentValidationService,
    private readonly notificationService: NotificationService,
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
  ) {
    this.logger = baseLogger.child({ context: ClassService.name });
  }

  /**
   * Fetches teachers for a specific class and session.
   */
  async getTeachersByClass(
    classId: string,
    sessionId?: string,
  ): Promise<TeacherAssignmentResponseDto[]> {
    const classExist = await this.classModelAction.get({
      identifierOptions: { id: classId },
    });

    if (!classExist || classExist.is_deleted) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    // Handle Session Logic (Default to active if null)
    const target_session = sessionId || (await this.getActiveSession());

    // Fetch Assignments with Relations
    const assignments = await this.classTeacherModelAction.list({
      filterRecordOptions: {
        class: { id: classId },
        session_id:
          typeof target_session === 'string'
            ? target_session
            : target_session.id,
        is_active: true,
      },
      relations: {
        teacher: { user: true },
        class: { streams: true },
      },
    });

    // Map to DTO
    return assignments.payload.map((assignment) => {
      const streamList: Stream[] = assignment.class.streams || [];
      const streamNames = streamList.map((s) => s.name).join(', ');
      return {
        teacher_id: assignment.teacher.id,
        name: assignment.teacher.user
          ? `${assignment.teacher.user.first_name} ${assignment.teacher.user.last_name}`
          : `Teacher ${assignment.teacher.employment_id}`,
        assignment_date: assignment.assignment_date,
        streams: streamNames,
      };
    });
  }

  /**
   * Creates a class and links it to the active academic session.
   */
  async create(createClassDto: CreateClassDto): Promise<ICreateClassResponse> {
    const { name, arm, teacherIds } = createClassDto;

    // Validate teacherIds are valid UUIDs and remove duplicates
    let uniqueTeacherIds: string[] = [];
    if (Array.isArray(teacherIds) && teacherIds.length > 0) {
      for (const teacherId of teacherIds) {
        if (!isUUID(teacherId)) {
          throw new BadRequestException(sysMsg.INVALID_TEACHER_ID);
        }
      }
      // Remove duplicates
      uniqueTeacherIds = [...new Set(teacherIds)];
    }

    // Fetch active academic session
    const academicSession = await this.getActiveSession();

    const { payload } = await this.classModelAction.find({
      findOptions: {
        name,
        arm,
        academicSession: { id: academicSession.id },
        is_deleted: false,
      },
      transactionOptions: {
        useTransaction: false,
      },
    });
    if (payload.length > 0) {
      throw new ConflictException(sysMsg.CLASS_ALREADY_EXIST);
    }

    // Use transaction for atomic creation
    const createdClass = await this.dataSource.transaction(async (manager) => {
      const newClass = await this.classModelAction.create({
        createPayload: {
          name,
          arm,
          academicSession,
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });

      // Assign teachers if provided
      if (uniqueTeacherIds.length > 0) {
        for (const teacherId of uniqueTeacherIds) {
          await this.classTeacherModelAction.create({
            createPayload: {
              class: newClass,
              teacher: { id: teacherId },
              session_id: academicSession.id,
              is_active: true,
              assignment_date: new Date(),
            },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
        }
      }

      this.logger.info(sysMsg.CLASS_CREATED, newClass);
      return newClass;
    });

    return {
      message: sysMsg.CLASS_CREATED,
      id: createdClass.id,
      name: createdClass.name,
      arm: createdClass.arm,
      academicSession: {
        id: academicSession.id,
        name: academicSession.name,
      },
      teacherIds: uniqueTeacherIds,
    };
  }

  /**
   * Fetches the active academic session entity.
   */
  private async getActiveSession(): Promise<AcademicSession> {
    const { payload } = await this.academicSessionModelAction.list({
      filterRecordOptions: { status: SessionStatus.ACTIVE },
    });
    if (!payload.length) throw new NotFoundException('No active session found');
    if (payload.length > 1)
      throw new ConflictException('Multiple active sessions found');
    return payload[0];
  }

  /**
   * Updates the name and/or arm of an existing class, ensuring uniqueness within the session.
   */
  async updateClass(
    classId: string,
    updateClassDto: UpdateClassDto,
  ): Promise<IUpdateClassResponse> {
    // 1. Fetch class by ID
    const existingClass = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });
    if (!existingClass || existingClass.is_deleted) {
      throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
    }

    // 2. Prepare new values
    const { name, arm } = updateClassDto;
    const newName = name ?? existingClass.name;
    const newArm = arm ?? existingClass.arm;
    const sessionId = existingClass.academicSession.id;

    // Prevent empty class name
    if (name !== undefined && (!newName || newName.trim() === '')) {
      throw new BadRequestException(sysMsg.CLASS_NAME_EMPTY);
    }

    // 3. Check uniqueness
    const { payload } = await this.classModelAction.find({
      findOptions: {
        name: newName,
        arm: newArm,
        academicSession: { id: sessionId },
        is_deleted: false,
      },
      transactionOptions: { useTransaction: false },
    });
    if (payload.length > 0 && payload[0].id !== classId) {
      throw new ConflictException(sysMsg.CLASS_ALREADY_EXIST);
    }

    // 4. Update and save
    existingClass.name = newName;
    existingClass.arm = newArm;
    await this.classModelAction.update({
      identifierOptions: { id: classId },
      updatePayload: { name: newName, arm: newArm },
      transactionOptions: { useTransaction: false },
    });

    // 5. Return response
    return {
      message: sysMsg.CLASS_UPDATED,
      id: existingClass.id,
      name: existingClass.name,
      arm: existingClass.arm,
      academicSession: {
        id: sessionId,
        name: existingClass.academicSession.name,
      },
    };
  }

  /**
   * Fetches all classes grouped by name and academic session, including arm.
   */
  async getGroupedClasses(page = 1, limit = 20) {
    // Use generic list method from AbstractModelAction
    const { payload: classesRaw, paginationMeta } =
      await this.classModelAction.list({
        filterRecordOptions: { is_deleted: false },
        relations: { academicSession: true },
        order: { name: 'ASC', arm: 'ASC' },
        paginationPayload: { page, limit },
      });

    const classes = Array.isArray(classesRaw) ? classesRaw : [];

    const grouped: Record<
      string,
      {
        name: string;
        academicSession: { id: string; name: string };
        classes: { id: string; arm?: string }[];
      }
    > = {};

    for (const cls of classes) {
      const key = `${cls.name}_${cls.academicSession.id}`;
      if (!grouped[key]) {
        grouped[key] = {
          name: cls.name,
          academicSession: {
            id: cls.academicSession.id,
            name: cls.academicSession.name,
          },
          classes: [],
        };
      }
      grouped[key].classes.push({ id: cls.id, arm: cls.arm });
    }

    return {
      message: sysMsg.CLASS_FETCHED,
      items: Object.values(grouped),
      pagination: paginationMeta,
    };
  }

  /**
   * Fetches a class by its ID.
   */
  async getClassById(classId: string): Promise<IGetClassByIdResponse> {
    const classEntity = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });
    if (!classEntity) {
      throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
    }
    return {
      message: sysMsg.CLASS_FETCHED,
      id: classEntity.id,
      name: classEntity.name,
      arm: classEntity.arm,
      is_deleted: classEntity.is_deleted,
      academicSession: {
        id: classEntity.academicSession.id,
        name: classEntity.academicSession.name,
      },
    };
  }

  /**
   * Fetches Total Number of Classes in the System.
   */
  async getTotalClasses(
    sessionId: string,
    name?: string,
    arm?: string,
  ): Promise<{ message: string; total: number }> {
    const filter: Record<string, unknown> = {
      academicSession: { id: sessionId },
    };
    if (name) filter.name = name;
    if (arm) filter.arm = arm;

    const { paginationMeta } = await this.classModelAction.list({
      filterRecordOptions: filter,
      paginationPayload: { page: 1, limit: 1 },
    });
    return {
      message: sysMsg.TOTAL_CLASSES_FETCHED,
      total: paginationMeta.total,
    };
  }
  /**
   * Soft deletes a class by ID.
   * Only allows deletion of classes from the active session.
   */
  async deleteClass(classId: string) {
    const classEntity = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });

    if (!classEntity || classEntity.is_deleted) {
      throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
    }

    // Get active session
    const activeSession = await this.getActiveSession();

    // Check if class belongs to active session
    if (classEntity.academicSession.id !== activeSession.id) {
      throw new BadRequestException(sysMsg.CANNOT_DELETE_PAST_SESSION_CLASS);
    }

    // Perform soft delete
    await this.classModelAction.update({
      identifierOptions: { id: classId },
      updatePayload: {
        is_deleted: true,
        deleted_at: new Date(),
      },
      transactionOptions: { useTransaction: false },
    });

    this.notifyClassUsers(
      classId,
      'Class Deactivation',
      `Your assigned class, ${classEntity.name} ${classEntity.arm || ''}, has been deactivated/archived.`,
      EventAction.UPDATED,
    ).catch((err) =>
      this.logger.error(
        `Failed to notify users on class deletion ${classId}`,
        err,
      ),
    );

    return {
      status_code: HttpStatus.OK,
      message: sysMsg.CLASS_DELETED,
    };
  }

  /**
   * Assigns a single student to a class.
   * Uses the class's academic session automatically.
   */
  async assignStudentToClass(
    classId: string,
    studentId: string,
  ): Promise<{
    message: string;
    assigned: boolean;
    reactivated: boolean;
    classId: string;
    studentId: string;
  }> {
    // Get class and session (validates class exists and is not deleted)
    const classEntity =
      await this.classStudentValidationService.validateClassExists(classId);
    const sessionId = classEntity.academicSession.id;

    // Validate assignment rules (outside transaction for early failure)
    await this.classStudentValidationService.validateStudentAssignment(
      classId,
      studentId,
      sessionId,
    );

    // Perform assignment in transaction
    let assigned = false;
    let reactivated = false;

    await this.dataSource.transaction(async (manager) => {
      // Re-validate inside transaction (for race conditions)
      await this.classStudentValidationService.validateStudentAssignment(
        classId,
        studentId,
        sessionId,
        manager,
      );

      // Check for existing assignment
      const existingAssignment =
        await this.classStudentValidationService.getExistingAssignment(
          classId,
          studentId,
          sessionId,
          manager,
        );

      if (existingAssignment) {
        if (existingAssignment.is_active) {
          // Already assigned - no action needed
          return;
        } else {
          // Reactivate the existing assignment
          existingAssignment.is_active = true;
          existingAssignment.enrollment_date = new Date();
          await manager.save(ClassStudent, existingAssignment);
          // Update student's current_class_id using StudentModelAction for consistency
          await this.studentModelAction.update({
            identifierOptions: { id: studentId },
            updatePayload: { current_class_id: classId },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
          reactivated = true;
          return;
        }
      }

      // Create new assignment
      await this.classStudentModelAction.create({
        createPayload: {
          class: { id: classId },
          student: { id: studentId },
          session_id: sessionId,
          is_active: true,
          enrollment_date: new Date(),
        },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });
      // Update student's current_class_id using StudentModelAction for consistency
      await this.studentModelAction.update({
        identifierOptions: { id: studentId },
        updatePayload: { current_class_id: classId },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });
      assigned = true;
    });

    // Build response message
    let message = '';
    if (reactivated) {
      message = 'Student assignment reactivated successfully.';
    } else if (assigned) {
      message = 'Student assigned to class successfully.';
    } else {
      message = 'Student is already assigned to this class.';
    }

    this.logger.info(`Student ${studentId} assignment to class ${classId}`, {
      classId,
      studentId,
      sessionId,
      assigned,
      reactivated,
    });

    if (assigned || reactivated) {
      const actionText = reactivated ? 'reactivated' : 'assigned';
      this.notifyClassUsers(
        classId,
        'New Class Enrollment',
        `A student has been ${actionText} to ${classEntity.name} ${classEntity.arm || ''}.`,
        EventAction.UPDATED,
        studentId,
      ).catch((err) =>
        this.logger.error(
          `Failed to notify users on student assignment ${studentId}`,
          err,
        ),
      );
    }

    return {
      message,
      assigned: assigned || reactivated,
      reactivated,
      classId,
      studentId,
    };
  }

  /**
   * Unassigns a student from a class.
   * Sets current_class_id to null and deactivates the class assignment.
   */
  async unassignStudentFromClass(
    classId: string,
    studentId: string,
  ): Promise<{ message: string }> {
    // 1. Validate class exists and get session ID
    const classEntity =
      await this.classStudentValidationService.validateClassExists(classId);
    const sessionId = classEntity.academicSession.id;

    // 2. Validate student exists
    await this.classStudentValidationService.validateStudentExists(studentId);

    // 4. Perform unassignment in transaction
    await this.dataSource.transaction(async (manager) => {
      // Fetch and validate the assignment inside the transaction to prevent race conditions
      const existingAssignment =
        await this.classStudentValidationService.getExistingAssignment(
          classId,
          studentId,
          sessionId,
          manager,
        );

      if (!existingAssignment || !existingAssignment.is_active) {
        throw new NotFoundException(sysMsg.STUDENT_NOT_ASSIGNED_TO_CLASS);
      }

      // Deactivate assignment
      existingAssignment.is_active = false;
      await manager.save(ClassStudent, existingAssignment);

      // Conditionally update student's current_class_id to null
      // This prevents incorrectly nullifying the ID if it points to another class
      await this.studentModelAction.update({
        identifierOptions: { id: studentId, current_class_id: classId },
        updatePayload: { current_class_id: null },
        transactionOptions: {
          useTransaction: true,
          transaction: manager,
        },
      });
    });

    this.logger.info(
      `Student ${studentId} unassigned from class ${classId} in session ${sessionId}`,
    );

    return {
      message: sysMsg.STUDENT_UNASSIGNED_SUCCESSFULLY,
    };
  }

  /**
   * Assigns multiple students to a class.
   * Uses the class's academic session automatically.
   */
  async assignStudentsToClass(
    classId: string,
    assignStudentsDto: AssignStudentsToClassDto,
  ): Promise<{
    message: string;
    assigned: number;
    skipped: number;
    classId: string;
  }> {
    // Get class and session (validates class exists and is not deleted)
    const classEntity =
      await this.classStudentValidationService.validateClassExists(classId);
    const sessionId = classEntity.academicSession.id;

    // Remove duplicates
    const { studentIds } = assignStudentsDto;
    const uniqueStudentIds = [...new Set(studentIds)];
    if (uniqueStudentIds.length !== studentIds.length) {
      this.logger.warn(
        `Duplicate student IDs detected and removed. Original: ${studentIds.length}, Unique: ${uniqueStudentIds.length}`,
        { classId, studentIds },
      );
    }

    // Validate batch assignment rules (outside transaction for early failure)
    await this.classStudentValidationService.validateBatchStudentAssignment(
      classId,
      uniqueStudentIds,
      sessionId,
    );

    // Perform assignments in transaction
    let assignedCount = 0;
    let skippedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      // Re-validate inside transaction (for race conditions)
      await this.classStudentValidationService.validateBatchStudentAssignment(
        classId,
        uniqueStudentIds,
        sessionId,
        manager,
      );

      // Process each student
      for (const studentId of uniqueStudentIds) {
        const existingAssignment =
          await this.classStudentValidationService.getExistingAssignment(
            classId,
            studentId,
            sessionId,
            manager,
          );

        if (existingAssignment) {
          if (existingAssignment.is_active) {
            // Already active, skip
            skippedCount++;
            continue;
          } else {
            // Reactivate the existing assignment
            existingAssignment.is_active = true;
            existingAssignment.enrollment_date = new Date();
            await manager.save(ClassStudent, existingAssignment);
            // Update student's current_class_id using StudentModelAction for consistency
            await this.studentModelAction.update({
              identifierOptions: { id: studentId },
              updatePayload: { current_class_id: classId },
              transactionOptions: {
                useTransaction: true,
                transaction: manager,
              },
            });
            assignedCount++;
            continue;
          }
        }

        // Create new assignment
        await this.classStudentModelAction.create({
          createPayload: {
            class: { id: classId },
            student: { id: studentId },
            session_id: sessionId,
            is_active: true,
            enrollment_date: new Date(),
          },
          transactionOptions: {
            useTransaction: true,
            transaction: manager,
          },
        });
        // Update student's current_class_id using StudentModelAction for consistency
        await this.studentModelAction.update({
          identifierOptions: { id: studentId },
          updatePayload: { current_class_id: classId },
          transactionOptions: {
            useTransaction: true,
            transaction: manager,
          },
        });
        assignedCount++;
      }
    });

    this.logger.info(
      `Assigned ${assignedCount} students, skipped ${skippedCount} (already assigned) to class ${classId}`,
      {
        classId,
        studentIds: uniqueStudentIds,
        sessionId,
        assignedCount,
        skippedCount,
      },
    );

    // Build appropriate message based on results
    let message = '';
    if (assignedCount > 0 && skippedCount > 0) {
      message = `Successfully assigned ${assignedCount} student(s) to class. ${skippedCount} student(s) were already assigned and skipped.`;
    } else if (assignedCount > 0) {
      message = `Successfully assigned ${assignedCount} student(s) to class.`;
    } else if (skippedCount > 0) {
      message = `All ${skippedCount} student(s) were already assigned to this class. No new assignments made.`;
    } else {
      message = `No students were assigned.`;
    }

    if (assignedCount > 0) {
      this.notifyClassUsers(
        classId,
        'Batch Enrollment Update',
        `${assignedCount} students were newly enrolled or reactivated in ${classEntity.name} ${classEntity.arm || ''}.`,
        EventAction.UPDATED,
      ).catch((err) =>
        this.logger.error(
          `Failed to notify users on batch assignment ${classId}`,
          err,
        ),
      );
    }

    return {
      message,
      assigned: assignedCount,
      skipped: skippedCount,
      classId,
    };
  }

  /**
   * Fetches students for a specific class.
   * Uses the class's academic session automatically.
   */
  async getStudentsByClass(
    classId: string,
    sessionId?: string,
  ): Promise<StudentAssignmentResponseDto[]> {
    // 1. Validate class exists and get its academic session
    const classExist = await this.classModelAction.get({
      identifierOptions: { id: classId },
      relations: { academicSession: true },
    });
    if (!classExist) {
      throw new NotFoundException(`Class with ID ${classId} not found`);
    }

    // 2. Use the class's academic session (or provided sessionId for filtering)
    const target_session_id = sessionId || classExist.academicSession.id;

    // 3. Fetch Assignments with Relations
    const assignments = await this.classStudentModelAction.list({
      filterRecordOptions: {
        class: { id: classId },
        session_id: target_session_id,
        is_active: true,
      },
      relations: {
        student: { user: true },
      },
    });

    // 4. Map to DTO
    return assignments.payload.map((assignment) => {
      const student = assignment.student;
      const user = student.user;
      const fullName = user
        ? `${user.first_name} ${user.last_name}`
        : `Student ${student.registration_number}`;
      return {
        student_id: student.id,
        registration_number: student.registration_number,
        name: fullName,
        enrollment_date: assignment.enrollment_date,
        is_active: assignment.is_active,
      };
    });
  }

  /**
   * Fetches classes assigned to a specific teacher.
   * Optionally filters by session ID, defaults to active session.
   */
  async getClassesByTeacher(
    teacherId: string,
    sessionId?: string,
  ): Promise<ClassResponseDto[]> {
    // 1. Handle Session Logic (Default to active if null)
    const target_session = sessionId || (await this.getActiveSession());

    // 2. Fetch Assignments with Relations
    const assignments = await this.classTeacherModelAction.list({
      filterRecordOptions: {
        teacher: { id: teacherId },
        session_id:
          typeof target_session === 'string'
            ? target_session
            : target_session.id,
        is_active: true,
      },
      relations: {
        class: { academicSession: true },
      },
    });

    // 3. Map to DTO and remove duplicates (in case teacher is assigned multiple times)
    const uniqueClasses = new Map<string, ClassResponseDto>();
    assignments.payload.forEach((assignment) => {
      const classEntity = assignment.class;
      if (!classEntity.is_deleted && !uniqueClasses.has(classEntity.id)) {
        uniqueClasses.set(classEntity.id, {
          id: classEntity.id,
          name: classEntity.name,
          arm: classEntity.arm,
          academicSession: {
            id: classEntity.academicSession.id,
            name: classEntity.academicSession.name,
          },
        });
      }
    });

    return Array.from(uniqueClasses.values());
  }

  /**
   * Fetches all classes assigned to a specific teacher.
   * Returns an array of classes (can be empty if no classes are assigned).
   * Optionally filters by session ID, defaults to active session.
   */
  async getClassByTeacherId(
    teacherId: string,
    sessionId?: string,
  ): Promise<ClassResponseDto[]> {
    // 1. Validate teacher exists
    const teacher = await this.teacherModelAction.get({
      identifierOptions: { id: teacherId },
    });

    if (!teacher) {
      throw new NotFoundException(sysMsg.TEACHER_NOT_FOUND);
    }

    // 2. Handle Session Logic - validate if provided, otherwise default to active
    let target_session: AcademicSession | string;

    if (sessionId) {
      // Validate provided session exists
      const session = await this.academicSessionModelAction.get({
        identifierOptions: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundException(sysMsg.ACADEMIC_SESSION_NOT_FOUND);
      }

      target_session = sessionId;
    } else {
      // Use active session
      target_session = await this.getActiveSession();
    }

    // 3. Fetch Assignments with Relations
    const assignments = await this.classTeacherModelAction.list({
      filterRecordOptions: {
        teacher: { id: teacherId },
        session_id:
          typeof target_session === 'string'
            ? target_session
            : target_session.id,
        is_active: true,
      },
      relations: {
        class: { academicSession: true },
      },
    });

    // 4. Map to DTO and remove duplicates
    const uniqueClasses = new Map<string, ClassResponseDto>();
    assignments.payload.forEach((assignment) => {
      const classEntity = assignment.class;
      if (!classEntity.is_deleted && !uniqueClasses.has(classEntity.id)) {
        uniqueClasses.set(classEntity.id, {
          id: classEntity.id,
          name: classEntity.name,
          arm: classEntity.arm,
          academicSession: {
            id: classEntity.academicSession.id,
            name: classEntity.academicSession.name,
          },
          assignment_date: assignment.assignment_date,
          created_at: assignment.createdAt,
          updated_at: assignment.updatedAt,
        });
      }
    });

    return Array.from(uniqueClasses.values());
  }

  protected async notifyClassUsers(
    classId: string,
    title: string,
    message: string,
    action: EventAction,
    targetStudentId?: string,
  ): Promise<void> {
    try {
      const recipientIds = new Set<string>();

      // 1. Get Students and Parents
      const classStudents = await this.classStudentModelAction.list({
        filterRecordOptions: {
          class: { id: classId },
          ...(targetStudentId && { student: { id: targetStudentId } }),
          is_active: true,
        },
        relations: {
          student: { user: true, parent: { user: true } },
        },
      });

      classStudents.payload.forEach((cs) => {
        if (cs.student?.user?.id) recipientIds.add(cs.student.user.id);
        if (cs.student?.parent?.user?.id)
          recipientIds.add(cs.student.parent.user.id);
      });

      // 2. Get Teachers
      const classTeachers = await this.classTeacherModelAction.list({
        filterRecordOptions: { class: { id: classId }, is_active: true },
        relations: { teacher: { user: true } },
      });

      classTeachers.payload.forEach((ct) => {
        if (ct.teacher?.user?.id) recipientIds.add(ct.teacher.user.id);
      });

      const notificationDtos = Array.from(recipientIds).map((userId) => {
        const metadata: NotificationMetadata = {
          action: action,
          class_id: classId,
        };

        return {
          recipient_id: userId,
          title: title,
          message: message,
          type: NotificationType.ACADEMIC_UPDATE,
          metadata: metadata,
        };
      });

      await this.notificationService.createBulkNotifications(notificationDtos);

      this.logger.info(
        `Notifications created for ${recipientIds.size} users following class ${classId} change.`,
        { classId, action },
      );
    } catch (error) {
      this.logger.error(
        `Error in notifyClassUsers for class ${classId}:`,
        error,
      );
    }
  }
}
