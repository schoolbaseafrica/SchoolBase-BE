import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { School } from '../school/entities/school.entity';

export const attendanceMethods = ['NFC', 'FACE', 'FINGERPRINT'] as const;
export type AttendanceMethod = (typeof attendanceMethods)[number];

@Injectable()
export class AttendanceMethodPolicyService {
  constructor(private readonly dataSource: DataSource) {}

  private async school() {
    const school = await this.dataSource.manager.findOne(School, {
      where: { installation_completed: true },
      order: { createdAt: 'ASC' },
    });
    if (!school) throw new NotFoundException('School installation not found');
    return school;
  }

  async get() {
    const school = await this.school();
    const enabledMethods = (
      school.attendance_enabled_methods ?? ['NFC']
    ).filter((method): method is AttendanceMethod =>
      attendanceMethods.includes(method as AttendanceMethod),
    );
    return {
      enabledMethods,
      fingerprintProvider: school.fingerprint_provider ?? 'secugen',
      capabilities: {
        NFC: { available: true },
        FACE: {
          available: false,
          reason: 'Face recognition provider is not configured',
        },
        FINGERPRINT: {
          available: false,
          reason: 'SecuGen Android SDK and reader are not connected',
        },
      },
    };
  }

  async update(enabledMethods: AttendanceMethod[]) {
    if (
      !enabledMethods.length ||
      new Set(enabledMethods).size !== enabledMethods.length
    ) {
      throw new BadRequestException('Select distinct attendance methods');
    }
    if (enabledMethods.some((method) => method !== 'NFC')) {
      throw new BadRequestException(
        'Face and fingerprint require a configured recognition provider',
      );
    }
    const school = await this.school();
    school.attendance_enabled_methods = enabledMethods;
    await this.dataSource.manager.save(school);
    return this.get();
  }

  async require(method: AttendanceMethod) {
    const policy = await this.get();
    if (!policy.enabledMethods.includes(method)) {
      throw new ForbiddenException(
        `${method} attendance is disabled for this school`,
      );
    }
  }
}
