import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';

import { SessionStatus } from '../../academic-session/entities/academic-session.entity';
import { CreateClassDto } from '../../class/dto/create-class.dto';
import { Class } from '../../class/entities/class.entity';
import { ClassService } from '../../class/services/class.service';
import { CreateStudentDto } from '../dto';

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

  async import(rows: Record<string, string>[], actorUserId?: string) {
    const results: Array<{
      email: string;
      success: boolean;
      student?: unknown;
      error?: string;
    }> = [];
    for (const row of rows) {
      const dto = plainToInstance(CreateStudentDto, {
        first_name: row.first_name,
        last_name: row.last_name,
        middle_name: row.middle_name || undefined,
        email: row.email,
        phone: row.phone,
        registration_number: row.registration_number || undefined,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        home_address: row.home_address || undefined,
        password: row.password,
      });
      const errors = await validate(dto, { whitelist: true });
      if (errors.length) {
        results.push({
          email: row.email ?? '',
          success: false,
          error: `Invalid student data: ${errors.map((error) => error.property).join(', ')}`,
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
              email: dto.email,
              success: true,
              student,
              error: `Student created, but class assignment failed: ${error instanceof Error ? error.message : 'unknown error'}`,
            });
            continue;
          }
        }
        results.push({ email: dto.email, success: true, student });
      } catch (error) {
        results.push({
          email: dto.email,
          success: false,
          error:
            error instanceof Error ? error.message : 'Unable to create student',
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
