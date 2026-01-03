import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LandingPage } from '../entities/landing-page.entity';

@Injectable()
export class LandingPageModelAction extends AbstractModelAction<LandingPage> {
  constructor(
    @InjectRepository(LandingPage)
    landingPageRepository: Repository<LandingPage>,
  ) {
    super(landingPageRepository, LandingPage);
  }
}
