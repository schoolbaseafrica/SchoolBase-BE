import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { School } from '../../school/entities/school.entity';

// export interface ILandingPageSection {
//   key: string;
//   enabled: boolean;
// }

export interface IHeroImage {
  src: string;
  alt?: string;
}

export interface IHeroData {
  heading: string;
  body: string;
  cta_label: string;
  cta_href: string;
  images: IHeroImage[];
}

export interface IProgramItem {
  title: string;
  description: string;
  icon?: string;
}

export interface IFeatureItem {
  title: string;
  description: string;
  icon?: string;
}

export interface IFacilityItem {
  title: string;
  description: string;
  icon?: string;
}

export interface ITestimonialItem {
  name: string;
  role: string;
  quote: string;
  avatar?: string;
}

export interface IGalleryItem {
  src: string;
  alt?: string;
}

export interface IFAQItem {
  question: string;
  answer: string;
}

export interface ICTAData {
  heading: string;
  body: string;
  cta_label: string;
  cta_href: string;
}

export interface IContactData {
  office: string;
  email: string;
}

export interface ISocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}

export interface IFooterData {
  description: string;
  socials: ISocialLinks;
}

export interface IBrandPalette {
  primary: string;
  primary_hover: string;
  tint: string;
  on_primary: string;
  text: string;
  muted_text: string;
  surface: string;
}

@Entity('landing_pages')
export class LandingPage extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', unique: true, name: 'school_id' })
  school_id: string;

  @OneToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  //   @Column({
  //     type: 'jsonb',
  //     name: 'sections',
  //     default: () => "'[]'::jsonb",
  //   })
  //   sections: ILandingPageSection[];

  @Column({
    type: 'jsonb',
    name: 'hero',
    nullable: false,
  })
  hero: IHeroData;

  @Column({
    type: 'jsonb',
    name: 'programs',
    default: () => "'[]'::jsonb",
  })
  programs: IProgramItem[];

  @Column({
    type: 'jsonb',
    name: 'features',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  features?: IFeatureItem[];

  @Column({
    type: 'jsonb',
    name: 'facilities',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  facilities?: IFacilityItem[];

  @Column({
    type: 'text',
    name: 'about',
    nullable: true,
  })
  about?: string;

  @Column({
    type: 'text',
    name: 'why_us',
    nullable: true,
  })
  why_us?: string;

  @Column({
    type: 'jsonb',
    name: 'gallery',
    default: () => "'[]'::jsonb",
  })
  gallery: IGalleryItem[];

  @Column({
    type: 'jsonb',
    name: 'testimonials',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  testimonials?: ITestimonialItem[];

  @Column({
    type: 'jsonb',
    name: 'faqs',
    nullable: true,
    default: () => "'[]'::jsonb",
  })
  faqs?: IFAQItem[];

  @Column({
    type: 'jsonb',
    name: 'cta',
    nullable: false,
  })
  cta: ICTAData;

  @Column({
    type: 'jsonb',
    name: 'contact',
    nullable: false,
  })
  contact: IContactData;

  @Column({
    type: 'jsonb',
    name: 'footer',
    nullable: false,
  })
  footer: IFooterData;

  @Column({
    type: 'jsonb',
    name: 'palette',
    nullable: false,
  })
  palette: IBrandPalette;
}
