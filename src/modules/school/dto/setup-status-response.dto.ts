import { ApiProperty } from '@nestjs/swagger';

import { SetupPhase } from 'src/modules/shared/enums';

export class PhaseStatusDto {
  @ApiProperty()
  completed: boolean;

  @ApiProperty({ required: false })
  school_id?: string;

  @ApiProperty({ required: false })
  landing_page_id?: string;

  @ApiProperty({ required: false })
  superadmin_id?: string;
}

export class SetupStatusResponseDto {
  @ApiProperty()
  is_complete: boolean;

  @ApiProperty({ enum: SetupPhase, nullable: true, required: false })
  current_step: SetupPhase | null;

  @ApiProperty({ nullable: true, required: false })
  school_id: string | null;

  @ApiProperty()
  phases: {
    school_info: PhaseStatusDto;
    landing_page: PhaseStatusDto;
    superadmin: PhaseStatusDto;
  };
}
