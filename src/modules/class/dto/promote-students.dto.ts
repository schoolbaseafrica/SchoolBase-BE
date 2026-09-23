import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

export class PromotionMappingDto {
  @IsUUID()
  sourceClassId: string;

  @IsUUID()
  targetClassId: string;
}

export class PromoteStudentsDto {
  @IsUUID()
  sourceSessionId: string;

  @IsUUID()
  targetSessionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PromotionMappingDto)
  armMappings: PromotionMappingDto[];
}

export type PromotionPreviewMapping = {
  sourceClassId: string;
  targetClassId: string;
  sourceClassName: string;
  targetClassName: string;
  toPromote: number;
  toPromoteStudentIds: string[];
  alreadyInTarget: number;
  alreadyInTargetStudentIds: string[];
  errors: string[];
};

export type PromotionPreview = {
  sourceSessionId: string;
  targetSessionId: string;
  mappings: PromotionPreviewMapping[];
  errors: string[];
};
