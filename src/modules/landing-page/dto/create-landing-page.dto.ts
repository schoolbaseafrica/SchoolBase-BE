import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUrl,
  MaxLength,
  IsEmail,
  IsUUID,
} from 'class-validator';

export class HeroImageDto {
  @ApiProperty({
    description: 'Image source URL',
    example: 'https://example.com/hero-1.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  src: string;

  @ApiPropertyOptional({
    description: 'Image alt text',
    example: 'Students learning together',
  })
  @IsOptional()
  @IsString()
  alt?: string;
}

export class HeroDataDto {
  @ApiProperty({
    description: 'Hero heading',
    example: 'Welcome to Bright Future Academy',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  heading: string;

  @ApiProperty({
    description: 'Hero body text',
    example:
      'Modern learning, transparent updates, and a supportive community.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiProperty({
    description: 'Call-to-action button label',
    example: 'Get in touch',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cta_label: string;

  @ApiProperty({
    description: 'Call-to-action button href/link',
    example: '#contact',
  })
  @IsString()
  @IsNotEmpty()
  cta_href: string;
  @ApiProperty({
    description: 'Array of hero images',
    type: [HeroImageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeroImageDto)
  images: HeroImageDto[];
}

export class ProgramItemDto {
  @ApiProperty({
    description: 'Program title',
    example: 'STEM Program',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({
    description: 'Program description',
    example: 'Hands-on learning in science and tech.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @ApiProperty({
    description: 'Program icon identifier',
    example: 'cpu',
  })
  @IsString()
  @IsOptional()
  icon?: string;
}

export class FeatureItemDto {
  @ApiProperty({
    description: 'Feature title',
    example: 'Smart Reports',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({
    description: 'Feature description',
    example: 'Real-time updates for parents.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @ApiProperty({
    description: 'Feature icon identifier',
    example: 'chart',
  })
  @IsString()
  @IsOptional()
  icon?: string;
}

export class FacilityItemDto {
  @ApiProperty({
    description: 'Facility title',
    example: 'Modern Labs',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({
    description: 'Facility description',
    example: 'Safe, fully equipped science labs.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @ApiProperty({
    description: 'Facility icon identifier',
    example: 'beaker',
  })
  @IsString()
  @IsOptional()
  icon?: string;
}

export class TestimonialItemDto {
  @ApiProperty({
    description: 'Testimonial author first name',
    example: 'Ada',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  fname: string;

  @ApiProperty({
    description: 'Testimonial author last name',
    example: 'Obi',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lname: string;

  @ApiProperty({
    description: 'Testimonial author role',
    example: 'Parent',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  role: string;

  @ApiProperty({
    description: 'Testimonial quote',
    example: 'The communication is amazing and the teachers are supportive.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  quote: string;

  @ApiPropertyOptional({
    description: 'Testimonial author avatar URL',
    example: 'https://example.com/avatar-1.jpg',
  })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}

export class GalleryItemDto {
  @ApiProperty({
    description: 'Gallery image source URL',
    example: 'https://example.com/gallery-1.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  src: string;

  @ApiPropertyOptional({
    description: 'Gallery image alt text',
    example: 'Library study',
  })
  @IsOptional()
  @IsString()
  alt?: string;
}

export class FAQItemDto {
  @ApiProperty({
    description: 'FAQ question',
    example: 'When does enrollment open?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  question: string;

  @ApiProperty({
    description: 'FAQ answer',
    example: 'Admissions open in March.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  answer: string;
}

export class CTADataDto {
  @ApiProperty({
    description: 'CTA heading',
    example: 'Ready to enroll?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  heading: string;

  @ApiProperty({
    description: 'CTA body text',
    example: "Start your child's journey with us today.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  body: string;

  @ApiProperty({
    description: 'CTA button label',
    example: 'Apply now',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  cta_label: string;

  @ApiProperty({
    description: 'CTA button href/link',
    example: '/apply',
  })
  @IsString()
  @IsNotEmpty()
  cta_href: string;
}

export class ContactDataDto {
  @ApiProperty({
    description: 'Office address',
    example: 'Bright Future Academy, 24 Unity Road, Lagos',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  office: string;

  @ApiProperty({
    description: 'Contact email',
    example: 'hello@brightfuture.edu',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class SocialLinksDto {
  @ApiPropertyOptional({
    description: 'Facebook page URL',
    example: 'https://facebook.com/brightfuture',
  })
  @IsOptional()
  @IsUrl()
  facebook?: string;

  @ApiPropertyOptional({
    description: 'Instagram profile URL',
    example: 'https://instagram.com/brightfuture',
  })
  @IsOptional()
  @IsUrl()
  instagram?: string;

  @ApiPropertyOptional({
    description: 'LinkedIn profile URL',
    example: 'https://linkedin.com/school/brightfuture',
  })
  @IsOptional()
  @IsUrl()
  linkedin?: string;

  @ApiPropertyOptional({
    description: 'Twitter/X profile URL',
    example: 'https://twitter.com/brightfuture',
  })
  @IsOptional()
  @IsUrl()
  twitter?: string;

  @ApiPropertyOptional({
    description: 'Website URL',
    example: 'https://brightfuture.edu',
  })
  @IsOptional()
  @IsUrl()
  website?: string;
}

export class FooterDataDto {
  @ApiProperty({
    description: 'Footer description text',
    example: 'Bright Future Academy empowers every learner.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @ApiProperty({
    description: 'Social media links',
    type: SocialLinksDto,
  })
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socials: SocialLinksDto;
}

export class BrandPaletteDto {
  @ApiProperty({
    description: 'Primary brand color (hex)',
    example: '#c7363f',
  })
  @IsString()
  @IsNotEmpty()
  primary: string;

  @ApiProperty({
    description: 'Primary hover color (hex)',
    example: '#b12f37',
  })
  @IsString()
  @IsNotEmpty()
  primary_hover: string;

  @ApiProperty({
    description: 'Tint color (hex)',
    example: '#fbe6e9',
  })
  @IsString()
  @IsNotEmpty()
  tint: string;
  @ApiProperty({
    description: 'Text color on primary background (hex)',
    example: '#ffffff',
  })
  @IsString()
  @IsNotEmpty()
  on_primary: string;

  @ApiProperty({
    description: 'Main text color (hex)',
    example: '#1f2024',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Muted text color (hex)',
    example: '#4a4a4a',
  })
  @IsString()
  @IsNotEmpty()
  muted_text: string;

  @ApiProperty({
    description: 'Surface/background color (hex)',
    example: '#fff9f7',
  })
  @IsString()
  @IsNotEmpty()
  surface: string;
}

// Main DTO
export class CreateLandingPageDto {
  @ApiPropertyOptional({
    description: 'The ID of the school that the landing page belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsUUID()
  school_id: string;

  @ApiProperty({
    description: 'Hero section data',
    type: HeroDataDto,
  })
  @ValidateNested()
  @Type(() => HeroDataDto)
  hero: HeroDataDto;

  @ApiProperty({
    description: 'Programs section items',
    type: [ProgramItemDto],
    default: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramItemDto)
  programs: ProgramItemDto[];

  @ApiPropertyOptional({
    description: 'Features section items',
    type: [FeatureItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureItemDto)
  features?: FeatureItemDto[];

  @ApiPropertyOptional({
    description: 'Facilities section items',
    type: [FacilityItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FacilityItemDto)
  facilities?: FacilityItemDto[];

  @ApiPropertyOptional({
    description: 'About section content',
    example: 'Our school was founded in 1990...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  about?: string;

  @ApiPropertyOptional({
    description: 'Why Us section content',
    example: 'We offer the best education because...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  why_us?: string;

  @ApiProperty({
    description: 'Gallery section items',
    type: [GalleryItemDto],
    default: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GalleryItemDto)
  gallery: GalleryItemDto[];

  @ApiPropertyOptional({
    description: 'Testimonials section items',
    type: [TestimonialItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestimonialItemDto)
  testimonials?: TestimonialItemDto[];

  @ApiPropertyOptional({
    description: 'FAQs section items',
    type: [FAQItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FAQItemDto)
  faqs?: FAQItemDto[];

  @ApiProperty({
    description: 'Call-to-action section data',
    type: CTADataDto,
  })
  @ValidateNested()
  @Type(() => CTADataDto)
  cta: CTADataDto;

  @ApiProperty({
    description: 'Contact section data',
    type: ContactDataDto,
  })
  @ValidateNested()
  @Type(() => ContactDataDto)
  contact: ContactDataDto;

  @ApiProperty({
    description: 'Footer section data',
    type: FooterDataDto,
  })
  @ValidateNested()
  @Type(() => FooterDataDto)
  footer: FooterDataDto;

  @ApiProperty({
    description: 'Brand color palette',
    type: BrandPaletteDto,
  })
  @ValidateNested()
  @Type(() => BrandPaletteDto)
  palette: BrandPaletteDto;
}

export class LandingPageResponseDto extends CreateLandingPageDto {
  @ApiProperty({
    description: 'Landing page ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  id: string;
}
