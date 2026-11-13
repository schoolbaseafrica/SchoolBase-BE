import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, IsNull } from 'typeorm';

import { bulkPersonCsvErrors } from '../../../common/utils/bulk-person-csv-validation';
import { SessionStatus } from '../../academic-session/entities/academic-session.entity';
import { CreateClassDto } from '../../class/dto/create-class.dto';
import { ClassStudent } from '../../class/entities/class-student.entity';
import { Class } from '../../class/entities/class.entity';
import { ClassService } from '../../class/services/class.service';
import { CreateStudentDto } from '../dto';
import { PatchStudentDto } from '../dto/update-student.dto';
import { Student } from '../entities/student.entity';

import { StudentService } from './student.service';

@Injectable()
export class StudentBulkImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly students: StudentService,
    private readonly classes: ClassService,
  ) {}

  private normalizeClass(name: string, arm: string) {
    return plainToInstance(CreateClassDto, { name, arm });
  }

  private async findClass(name: string, arm: string) {
    const normalized = this.normalizeClass(name, arm);
    return this.dataSource.getRepository(Class).findOne({
      where: {
        name: normalized.name,
        arm: normalized.arm || undefined,
        is_deleted: false,
        academicSession: { status: SessionStatus.ACTIVE },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async validateClasses(rows: Record<string, string>[]) {
    const requested = new Map<
      string,
      { name: string; arm?: string; student_count: number }
    >();
    for (const row of rows) {
      const name = row.class?.trim();
      if (!name) continue;
      const arm = row.arm?.trim() || '';
      const normalized = this.normalizeClass(name, arm);
      const key = `${normalized.name}\0${normalized.arm}`;
      const item = requested.get(key) ?? {
        name,
        arm: arm || undefined,
        student_count: 0,
      };
      item.student_count++;
      requested.set(key, item);
    }
    const missing_classes: Array<{
      name: string;
      arm?: string;
      student_count: number;
    }> = [];
    const existing_classes: typeof missing_classes = [];
    for (const item of requested.values()) {
      const found = await this.findClass(item.name, item.arm ?? '');
      (found ? existing_classes : missing_classes).push(item);
    }
    return { missing_classes, existing_classes };
  }

  private async prepareUpdates(rows: Record<string, string>[]) {
    const seen = new Set<string>();
    const results: Array<{
      row: number;
      registration_number: string;
      student_id?: string;
      class_id?: string;
      changed_fields: string[];
      error?: string;
      patch?: PatchStudentDto;
    }> = [];
    const allowed = [
      'first_name',
      'last_name',
      'middle_name',
      'email',
      'phone',
      'date_of_birth',
      'gender',
      'home_address',
    ] as const;
    const supported = new Set<string>([
      'registration_number',
      'class',
      'arm',
      ...allowed,
    ]);
    for (const [index, row] of rows.entries()) {
      const registration_number = row.registration_number?.trim() ?? '';
      const entry: (typeof results)[number] = {
        row: index + 2,
        registration_number,
        changed_fields: [],
      };
      results.push(entry);
      if (!registration_number) {
        entry.error = `Row ${entry.row}: Registration Number is required to match an existing student`;
        continue;
      }
      if (seen.has(registration_number)) {
        entry.error = `Row ${entry.row}: Registration Number appears more than once in this file`;
        continue;
      }
      seen.add(registration_number);
      if (row.password?.trim()) {
        entry.error = `Row ${entry.row}: Password cannot be changed by bulk update`;
        continue;
      }
      const unsupported = Object.keys(row).filter(
        (field) => !supported.has(field) && row[field]?.trim(),
      );
      if (unsupported.length) {
        entry.error = `Row ${entry.row}: Unsupported update column(s): ${unsupported.join(', ')}`;
        continue;
      }
      const student = await this.dataSource.getRepository(Student).findOne({
        where: { registration_number, is_deleted: false },
        relations: { user: true },
      });
      if (!student || !student.user?.is_active) {
        entry.error = `Row ${entry.row}: No active student has Registration Number ${registration_number}`;
        continue;
      }
      const values = Object.fromEntries(
        allowed
          .filter((field) => row[field]?.trim())
          .map((field) => [field, row[field].trim()]),
      );
      const className = row.class?.trim();
      if (row.arm?.trim() && !className) {
        entry.error = `Row ${entry.row}: Class is required when Arm is supplied`;
        continue;
      }
      if (className && Object.keys(values).length) {
        entry.error = `Row ${entry.row}: Put class assignment on a separate row from profile updates`;
        continue;
      }
      if (Object.keys(values).length === 0 && !className) {
        entry.error = `Row ${entry.row}: Add at least one nonempty field to update`;
        continue;
      }
      if (className) {
        const normalized = this.normalizeClass(
          className,
          row.arm?.trim() ?? '',
        );
        const classFilter = {
          name: normalized.name,
          is_deleted: false,
          academicSession: { status: SessionStatus.ACTIVE },
        };
        const targetClass = await this.dataSource.getRepository(Class).findOne({
          where: normalized.arm
            ? { ...classFilter, arm: normalized.arm }
            : [
                { ...classFilter, arm: IsNull() },
                { ...classFilter, arm: '' },
              ],
          relations: { academicSession: true },
        });
        if (!targetClass) {
          entry.error = `Row ${entry.row}: Class ${className}${row.arm?.trim() ? ` ${row.arm.trim()}` : ''} does not exist in the current session`;
          continue;
        }
        const enrollment = await this.dataSource
          .getRepository(ClassStudent)
          .findOne({
            where: {
              student: { id: student.id },
              session_id: targetClass.academicSession.id,
              is_active: true,
            },
            relations: { class: true },
          });
        if (enrollment && enrollment.class.id !== targetClass.id) {
          entry.error = `Row ${entry.row}: Student is already assigned to ${enrollment.class.name}${enrollment.class.arm ? ` ${enrollment.class.arm}` : ''} in the current session`;
          continue;
        }
        entry.student_id = student.id;
        entry.class_id = targetClass.id;
        entry.changed_fields = enrollment ? [] : ['class'];
        continue;
      }
      const patch = plainToInstance(PatchStudentDto, values);
      const errors = bulkPersonCsvErrors(
        row,
        await validate(patch, { whitelist: true }),
      );
      if (errors.length) {
        entry.error = `Row ${entry.row}: ${errors.join('; ')}`;
        continue;
      }
      const existing = student.user as unknown as Record<string, unknown>;
      entry.changed_fields = Object.keys(values).filter((field) => {
        const current =
          field === 'date_of_birth'
            ? existing.dob
            : existing[field === 'home_address' ? 'homeAddress' : field];
        const normalized =
          current instanceof Date
            ? current.toISOString().slice(0, 10)
            : String(current ?? '').trim();
        return normalized !== values[field];
      });
      entry.student_id = student.id;
      entry.patch = plainToInstance(
        PatchStudentDto,
        Object.fromEntries(
          entry.changed_fields.map((field) => [field, values[field]]),
        ),
      );
    }
    return results;
  }

  async previewUpdates(rows: Record<string, string>[]) {
    const results = await this.prepareUpdates(rows);
    return {
      total: results.length,
      ready: results.filter(
        (item) => !item.error && item.changed_fields.length > 0,
      ).length,
      unchanged: results.filter(
        (item) => !item.error && item.changed_fields.length === 0,
      ).length,
      failed: results.filter((item) => item.error).length,
      results: results.map((item) => ({
        row: item.row,
        registration_number: item.registration_number,
        changed_fields: item.changed_fields,
        error: item.error,
      })),
    };
  }

  async updateExisting(rows: Record<string, string>[], actorUserId: string) {
    const prepared = await this.prepareUpdates(rows);
    if (prepared.some((item) => item.error)) {
      return {
        total: prepared.length,
        updated: 0,
        unchanged: 0,
        failed: prepared.filter((item) => item.error).length,
        results: prepared.map((item) => ({
          row: item.row,
          registration_number: item.registration_number,
          changed_fields: item.changed_fields,
          error: item.error,
        })),
      };
    }
    const results: Array<{
      row: number;
      registration_number: string;
      changed_fields: string[];
      error?: string;
    }> = [];
    for (const item of prepared) {
      if (!item.changed_fields.length) {
        results.push({
          row: item.row,
          registration_number: item.registration_number,
          changed_fields: [],
        });
        continue;
      }
      try {
        if (item.class_id) {
          await this.classes.assignStudentToClass(
            item.class_id,
            item.student_id!,
          );
        } else {
          await this.students.update(
            item.student_id!,
            item.patch!,
            actorUserId,
          );
        }
        results.push({
          row: item.row,
          registration_number: item.registration_number,
          changed_fields: item.changed_fields,
        });
      } catch (error) {
        results.push({
          row: item.row,
          registration_number: item.registration_number,
          changed_fields: [],
          error: `Row ${item.row}: ${error instanceof Error ? error.message : 'Unable to update student'}`,
        });
      }
    }
    return {
      total: results.length,
      updated: results.filter(
        (item) => !item.error && item.changed_fields.length > 0,
      ).length,
      unchanged: results.filter(
        (item) => !item.error && item.changed_fields.length === 0,
      ).length,
      failed: results.filter((item) => item.error).length,
      results,
    };
  }

  async import(rows: Record<string, string>[], actorUserId?: string) {
    const results: Array<{
      email: string;
      success: boolean;
      student?: unknown;
      error?: string;
    }> = [];
    for (const [index, row] of rows.entries()) {
      const dto = plainToInstance(CreateStudentDto, {
        first_name: row.first_name,
        last_name: row.last_name,
        middle_name: row.middle_name || undefined,
        email: row.email?.trim() || undefined,
        phone: row.phone,
        registration_number: row.registration_number || undefined,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        home_address: row.home_address || undefined,
        password: row.password,
      });
      const errors = await validate(dto, { whitelist: true });
      const fieldErrors = bulkPersonCsvErrors(row, errors);
      if (fieldErrors.length) {
        results.push({
          email: row.email ?? '',
          success: false,
          error: `Row ${index + 2}: ${fieldErrors.join('; ')}`,
        });
        continue;
      }
      try {
        const classEntity = row.class
          ? await this.findClass(row.class, row.arm || '')
          : null;
        const student = await this.students.create(dto, actorUserId);
        if (classEntity) {
          try {
            await this.classes.assignStudentToClass(classEntity.id, student.id);
          } catch (error) {
            results.push({
              email: dto.email ?? '',
              success: true,
              student,
              error: `Row ${index + 2}: Student created, but class assignment failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            });
            continue;
          }
        }
        results.push({ email: dto.email ?? '', success: true, student });
      } catch (error) {
        results.push({
          email: dto.email ?? '',
          success: false,
          error: `Row ${index + 2}: ${error instanceof Error ? error.message : 'Unable to create student'}`,
        });
      }
    }
    return {
      total: results.length,
      successful: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    };
  }
}
