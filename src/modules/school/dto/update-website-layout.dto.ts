import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum WebsiteLayout {
  ONE_PAGE = 'one_page',
  MULTI_PAGE = 'multi_page',
}

export class UpdateWebsiteLayoutDto {
  @ApiProperty({
    enum: WebsiteLayout,
    description: 'Public website layout used for this school',
  })
  @IsEnum(WebsiteLayout)
  website_layout: WebsiteLayout;
}
