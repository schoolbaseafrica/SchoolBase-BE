import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateLandingPageDto } from './create-landing-page.dto';

export class UpdateLandingPageDto extends PartialType(
  OmitType(CreateLandingPageDto, ['school_id'] as const),
) {}
