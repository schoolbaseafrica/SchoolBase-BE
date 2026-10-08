import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import * as sysMsg from '../../constants/system.messages';
import { LandingPageModelAction } from '../landing-page/model-actions/landing-page.action';
import { SetupPhase } from '../shared/enums';
import { Role } from '../superadmin/entities/superadmin.entity';
import { SuperadminModelAction } from '../superadmin/model-actions/superadmin-actions';
import { MinioService } from '../upload/services/minio.service';

import { CreateInstallationDto } from './dto/create-installation.dto';
import { UpdateMarketingSiteDto } from './dto/update-marketing-site.dto';
import {
  UpdateWebsiteLayoutDto,
  WebsiteLayout,
} from './dto/update-website-layout.dto';
import { SchoolModelAction } from './model-actions/school.action';

export interface ISetupStatusResponse {
  is_complete: boolean;
  current_step: SetupPhase | null;
  school_id: string | null;
  phases: {
    school_info: {
      completed: boolean;
      school_id?: string;
    };
    landing_page: {
      completed: boolean;
      landing_page_id?: string;
    };
    superadmin: {
      completed: boolean;
      superadmin_id?: string;
    };
  };
}

@Injectable()
export class SchoolService {
  constructor(
    private readonly schoolModelAction: SchoolModelAction,
    private readonly landingPageModelAction: LandingPageModelAction,
    private readonly superadminModelAction: SuperadminModelAction,
    private readonly dataSource: DataSource,
    private readonly minio: MinioService,
  ) {}

  async processInstallation(
    createInstallationDto: CreateInstallationDto,
    logoFile?: IMulterFile,
  ) {
    let uploadedKey: string | undefined;
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(908230504)');
        const [{ payload: schools }, superadmin] = await Promise.all([
          this.schoolModelAction.list({}),
          this.superadminModelAction.get({
            identifierOptions: { role: Role.SUPERADMIN },
          }),
        ]);
        if (schools?.length || superadmin) {
          throw new ConflictException(
            'Initial school setup is already complete',
          );
        }

        let logoUrl: string | null = null;
        if (logoFile) {
          const uploaded = await this.minio.uploadImage(
            logoFile,
            'schoolbase-school-logos',
          );
          logoUrl = uploaded.url;
          uploadedKey = uploaded.publicId;
        }

        const school = await this.schoolModelAction.create({
          createPayload: {
            name: createInstallationDto.name,
            address: createInstallationDto.address,
            email: createInstallationDto.email,
            phone: createInstallationDto.phone,
            logo_url: logoUrl,
            primary_color: createInstallationDto.primary_color,
            secondary_color: createInstallationDto.secondary_color,
            accent_color: createInstallationDto.accent_color,
            installation_completed: true,
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });

        return {
          id: school.id,
          name: school.name,
          address: school.address,
          email: school.email,
          phone: school.phone,
          logo_url: school.logo_url,
          primary_color: school.primary_color,
          secondary_color: school.secondary_color,
          accent_color: school.accent_color,
          installation_completed: school.installation_completed,
          message: sysMsg.INSTALLATION_COMPLETED,
        };
      });
    } catch (error) {
      if (uploadedKey)
        await this.minio.deleteImage(uploadedKey).catch(() => undefined);
      throw error;
    }
  }

  async getSchoolDetails() {
    const { payload } = await this.schoolModelAction.list({
      filterRecordOptions: { installation_completed: true },
    });

    if (!payload || payload.length === 0) {
      throw new ConflictException(sysMsg.SCHOOL_NOT_FOUND);
    }

    const school = payload[0];

    return {
      id: school.id,
      name: school.name,
      address: school.address,
      email: school.email,
      phone: school.phone,
      logo_url: school.logo_url,
      primary_color: school.primary_color,
      secondary_color: school.secondary_color,
      accent_color: school.accent_color,
      installation_completed: school.installation_completed,
      website_layout: school.use_marketing_site
        ? WebsiteLayout.MULTI_PAGE
        : WebsiteLayout.ONE_PAGE,
      use_marketing_site: school.use_marketing_site ?? false,
      marketing_site_config: school.marketing_site_config ?? null,
      activity_log_retention_days: school.activity_log_retention_days ?? null,
      school_code: school.school_code ?? null,
      student_id_format: school.student_id_format ?? null,
      student_id_prefix: school.student_id_prefix ?? 'STU',
      allow_manual_student_ids: school.allow_manual_student_ids ?? true,
      teacher_id_format: school.teacher_id_format ?? null,
      teacher_id_prefix: school.teacher_id_prefix ?? 'EMP',
      allow_manual_teacher_ids: school.allow_manual_teacher_ids ?? true,
      parent_id_format: school.parent_id_format ?? null,
      parent_id_prefix: school.parent_id_prefix ?? 'PAR',
      allow_manual_parent_ids: school.allow_manual_parent_ids ?? true,
      staff_id_format: school.staff_id_format ?? null,
      staff_id_prefix: school.staff_id_prefix ?? 'STF',
      allow_manual_staff_ids: school.allow_manual_staff_ids ?? true,
    };
  }

  async updateWebsiteLayout(dto: UpdateWebsiteLayoutDto) {
    const { payload } = await this.schoolModelAction.list({
      filterRecordOptions: { installation_completed: true },
    });

    if (!payload || payload.length === 0) {
      throw new ConflictException(sysMsg.SCHOOL_NOT_FOUND);
    }

    const useMarketingSite = dto.website_layout === WebsiteLayout.MULTI_PAGE;
    const school = await this.schoolModelAction.update({
      identifierOptions: { id: payload[0].id },
      updatePayload: { use_marketing_site: useMarketingSite },
      transactionOptions: { useTransaction: false },
    });

    return {
      id: school.id,
      website_layout: useMarketingSite
        ? WebsiteLayout.MULTI_PAGE
        : WebsiteLayout.ONE_PAGE,
      use_marketing_site: useMarketingSite,
    };
  }

  async updateMarketingSite(dto: UpdateMarketingSiteDto) {
    const { payload } = await this.schoolModelAction.list({
      filterRecordOptions: { installation_completed: true },
    });

    if (!payload || payload.length === 0) {
      throw new ConflictException(sysMsg.SCHOOL_NOT_FOUND);
    }

    const school = await this.schoolModelAction.update({
      identifierOptions: { id: payload[0].id },
      updatePayload: {
        marketing_site_config: dto.marketing_site_config,
      },
      transactionOptions: { useTransaction: false },
    });

    return {
      id: school.id,
      marketing_site_config: school.marketing_site_config ?? {},
    };
  }

  // SCHOOL SETUP STATUS
  async getSetupStatus() {
    // Check school info setup status
    const { payload: schools } = await this.schoolModelAction.list({
      filterRecordOptions: { installation_completed: true },
    });
    const school = schools && schools.length > 0 ? schools[0] : null;
    const schoolInfoCompleted = !!school;

    // Check landing page setup status
    const landingPage = school
      ? await this.landingPageModelAction.get({
          identifierOptions: { school_id: school.id },
        })
      : null;
    const landingPageCompleted = !!landingPage;

    // Check superadmin setup status
    const superadmin = await this.superadminModelAction.get({
      identifierOptions: { role: Role.SUPERADMIN },
    });
    const superadminCompleted = !!superadmin;

    // Determine current step
    let currentStep: SetupPhase | null = null;
    if (!schoolInfoCompleted) {
      currentStep = SetupPhase.SCHOOL_INFO;
    } else if (!landingPageCompleted) {
      currentStep = SetupPhase.LANDING_PAGE;
    } else if (!superadminCompleted) {
      currentStep = SetupPhase.SUPERADMIN;
    }

    const isComplete =
      schoolInfoCompleted && landingPageCompleted && superadminCompleted;
    const status = {
      is_complete: isComplete,
      current_step: currentStep,
      school_id: school ? school.id : null,
      phases: {
        school_info: {
          completed: schoolInfoCompleted,
          // school_id: school?.id,
        },
        landing_page: {
          completed: landingPageCompleted,
          // landing_page_id: landingPage?.id,
        },
        superadmin: {
          completed: superadminCompleted,
          // superadmin_id: superadmin?.id,
        },
      },
    };

    return {
      message: sysMsg.SETUP_STATUS_RETRIEVED_SUCCESSFULLY,
      ...status,
    };
  }

  findOne(id: number) {
    return `This action returns a #${id} school`;
  }

  remove(id: number) {
    return `This action removes a #${id} school`;
  }
}
