import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../constants/system.messages';
import { SchoolModelAction } from '../school/model-actions/school.action';

import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { LandingPageModelAction } from './model-actions/landing-page.action';

@Injectable()
export class LandingPageService {
  private readonly logger: Logger;
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly landingPageModelAction: LandingPageModelAction,
    private readonly schoolModelAction: SchoolModelAction,
    private readonly dataSource: DataSource,
  ) {
    this.logger = baseLogger.child({ context: LandingPageService.name });
  }
  create(createLandingPageDto: CreateLandingPageDto) {
    return this.dataSource.transaction(async () => {
      // Verify school exists
      const school = await this.schoolModelAction.get({
        identifierOptions: { id: createLandingPageDto.school_id },
      });

      if (!school) {
        throw new NotFoundException(sysMsg.SCHOOL_NOT_FOUND);
      }

      // Check if landing page already exists for this school
      const existingLandingPage = await this.landingPageModelAction.get({
        identifierOptions: { school_id: createLandingPageDto.school_id },
      });

      if (existingLandingPage) {
        throw new ConflictException(sysMsg.SCHOOL_ALREADY_HAS_A_LANDING_PAGE);
      }

      // Create landing page
      const landingPage = await this.landingPageModelAction.create({
        createPayload: {
          school_id: createLandingPageDto.school_id,
          hero: createLandingPageDto.hero,
          programs: createLandingPageDto.programs || [],
          features: createLandingPageDto.features || [],
          facilities: createLandingPageDto.facilities || [],
          about: createLandingPageDto.about,
          why_us: createLandingPageDto.why_us,
          gallery: createLandingPageDto.gallery || [],
          testimonials: createLandingPageDto.testimonials || [],
          faqs: createLandingPageDto.faqs || [],
          cta: createLandingPageDto.cta,
          contact: createLandingPageDto.contact,
          footer: createLandingPageDto.footer,
          palette: createLandingPageDto.palette,
        },
        transactionOptions: { useTransaction: false },
      });

      return {
        message: sysMsg.LANDING_PAGE_CREATED_SUCCESSFULLY,
        ...landingPage,
      };
    });
  }

  async findOne(schoolId: string) {
    const landingPage = await this.landingPageModelAction.get({
      identifierOptions: { school_id: schoolId },
      relations: { school: true },
    });

    if (!landingPage) {
      throw new NotFoundException(sysMsg.LANDING_PAGE_NOT_FOUND);
    }

    return {
      message: sysMsg.LANDING_PAGE_FETCHED_SUCCESSFULLY,
      ...landingPage,
    };
  }

  update(id: string, updateLandingPageDto: UpdateLandingPageDto) {
    return this.dataSource.transaction(async () => {
      // Check if landing page exists
      const landingPage = await this.landingPageModelAction.get({
        identifierOptions: { id },
      });

      if (!landingPage) {
        throw new NotFoundException(sysMsg.LANDING_PAGE_NOT_FOUND);
      }

      const updatedLandingPage = await this.landingPageModelAction.update({
        identifierOptions: { id },
        updatePayload: updateLandingPageDto,
        transactionOptions: { useTransaction: false },
      });

      return {
        message: sysMsg.LANDING_PAGE_UPDATED_SUCCESSFULLY,
        ...updatedLandingPage,
      };
    });
  }

  remove(id: number) {
    return `This action removes a #${id} landingPage`;
  }
}
