import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
} from 'class-validator';

export const ownerDigestCategories = [
  'students',
  'attendance',
  'fees',
  'assessments',
  'staff',
] as const;
export type OwnerDigestCategory = (typeof ownerDigestCategories)[number];
export type OwnerDigestFrequency = 'daily' | 'weekly';

export class OwnerEmailDigestDto {
  @IsBoolean()
  enabled: boolean;

  @IsIn(['daily', 'weekly'])
  frequency: OwnerDigestFrequency;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(ownerDigestCategories, { each: true })
  categories: OwnerDigestCategory[];
}
