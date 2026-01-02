import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
  ApiCreateLandingPageDocs,
  ApiGetLandingPageBySchoolIdDocs,
  ApiUpdateLandingPageDocs,
} from './docs/create-landing-page.swagger';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { LandingPageService } from './landing-page.service';

@ApiTags('Landing Page')
@Controller('landing-page')
export class LandingPageController {
  constructor(private readonly landingPageService: LandingPageService) {}

  @Post()
  @ApiCreateLandingPageDocs()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createLandingPageDto: CreateLandingPageDto) {
    return this.landingPageService.create(createLandingPageDto);
  }

  @Get(':schoolId')
  @ApiGetLandingPageBySchoolIdDocs()
  @HttpCode(HttpStatus.OK)
  findOne(@Param('schoolId') schoolId: string) {
    return this.landingPageService.findOne(schoolId);
  }

  @Patch(':id')
  @ApiUpdateLandingPageDocs()
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id') id: string,
    @Body() updateLandingPageDto: UpdateLandingPageDto,
  ) {
    return this.landingPageService.update(id, updateLandingPageDto);
  }
}
