import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import * as sysMsg from '../../constants/system.messages';
import { School } from '../school/entities/school.entity';
import { SchoolModelAction } from '../school/model-actions/school.action';

import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { LandingPage } from './entities/landing-page.entity';
import { LandingPageService } from './landing-page.service';
import { LandingPageModelAction } from './model-actions/landing-page.action';

describe('LandingPageService', () => {
  let service: LandingPageService;
  let landingPageModelAction: jest.Mocked<LandingPageModelAction>;
  let schoolModelAction: jest.Mocked<SchoolModelAction>;
  let dataSource: jest.Mocked<DataSource>;
  let mockLogger: jest.Mocked<Logger>;

  const mockSchoolId = '123e4567-e89b-12d3-a456-426614174000';
  const mockLandingPageId = '456e7890-e89b-12d3-a456-426614174001';

  const mockCreateLandingPageDto: CreateLandingPageDto = {
    school_id: mockSchoolId,
    hero: {
      heading: 'Welcome to Test School',
      body: 'Modern learning, transparent updates, and a supportive community.',
      cta_label: 'Get in touch',
      cta_href: '#contact',
      images: [
        {
          src: 'https://example.com/hero-1.jpg',
          alt: 'Students learning together',
        },
      ],
    },
    programs: [],
    features: [],
    facilities: [],
    gallery: [],
    testimonials: [],
    faqs: [],
    cta: {
      heading: 'Ready to enroll?',
      body: "Start your child's journey with us today.",
      cta_label: 'Apply now',
      cta_href: '/apply',
    },
    contact: {
      office: 'Test School, 24 Unity Road, Lagos',
      email: 'hello@testschool.edu',
    },
    footer: {
      description: 'Test School empowers every learner.',
      socials: {},
    },
    palette: {
      primary: '#c7363f',
      primary_hover: '#b12f37',
      tint: '#fbe6e9',
      on_primary: '#ffffff',
      text: '#1f2024',
      muted_text: '#4a4a4a',
      surface: '#fff9f7',
    },
  };

  const mockLandingPage: Partial<LandingPage> = {
    id: mockLandingPageId,
    school_id: mockSchoolId,
    hero: mockCreateLandingPageDto.hero,
    programs: [],
    features: [],
    facilities: [],
    gallery: [],
    testimonials: [],
    faqs: [],
    cta: mockCreateLandingPageDto.cta,
    contact: mockCreateLandingPageDto.contact,
    footer: mockCreateLandingPageDto.footer,
    palette: mockCreateLandingPageDto.palette,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSchool = {
    id: mockSchoolId,
    name: 'Test School',
  };

  beforeEach(async () => {
    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<Logger>;

    // Mock DataSource
    dataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback();
      }),
    } as unknown as jest.Mocked<DataSource>;

    // Mock Model Actions
    landingPageModelAction = {
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<LandingPageModelAction>;

    schoolModelAction = {
      get: jest.fn(),
    } as unknown as jest.Mocked<SchoolModelAction>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandingPageService,
        {
          provide: LandingPageModelAction,
          useValue: landingPageModelAction,
        },
        {
          provide: SchoolModelAction,
          useValue: schoolModelAction,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<LandingPageService>(LandingPageService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw NotFoundException when school does not exist', async () => {
      schoolModelAction.get.mockResolvedValue(null);

      await expect(service.create(mockCreateLandingPageDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(mockCreateLandingPageDto)).rejects.toThrow(
        sysMsg.SCHOOL_NOT_FOUND,
      );

      expect(schoolModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockSchoolId },
      });
      expect(landingPageModelAction.get).not.toHaveBeenCalled();
      expect(landingPageModelAction.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when landing page already exists for school', async () => {
      schoolModelAction.get.mockResolvedValue(mockSchool as School);
      landingPageModelAction.get.mockResolvedValue(
        mockLandingPage as LandingPage,
      );

      await expect(service.create(mockCreateLandingPageDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(mockCreateLandingPageDto)).rejects.toThrow(
        sysMsg.SCHOOL_ALREADY_HAS_A_LANDING_PAGE,
      );

      expect(schoolModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockSchoolId },
      });
      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { school_id: mockSchoolId },
      });
      expect(landingPageModelAction.create).not.toHaveBeenCalled();
    });

    it('should successfully create landing page when school exists and no landing page exists', async () => {
      schoolModelAction.get.mockResolvedValue(mockSchool as School);
      landingPageModelAction.get.mockResolvedValue(null);
      landingPageModelAction.create.mockResolvedValue(
        mockLandingPage as LandingPage,
      );

      const result = await service.create(mockCreateLandingPageDto);

      expect(result).toEqual({
        message: sysMsg.LANDING_PAGE_CREATED_SUCCESSFULLY,
        ...mockLandingPage,
      });
      expect(schoolModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockSchoolId },
      });
      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { school_id: mockSchoolId },
      });
      expect(landingPageModelAction.create).toHaveBeenCalledWith({
        createPayload: {
          school_id: mockSchoolId,
          hero: mockCreateLandingPageDto.hero,
          programs: [],
          features: [],
          facilities: [],
          about: undefined,
          why_us: undefined,
          gallery: [],
          testimonials: [],
          faqs: [],
          cta: mockCreateLandingPageDto.cta,
          contact: mockCreateLandingPageDto.contact,
          footer: mockCreateLandingPageDto.footer,
          palette: mockCreateLandingPageDto.palette,
        },
        transactionOptions: { useTransaction: false },
      });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when landing page does not exist', async () => {
      landingPageModelAction.get.mockResolvedValue(null);

      await expect(service.findOne(mockSchoolId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(mockSchoolId)).rejects.toThrow(
        sysMsg.LANDING_PAGE_NOT_FOUND,
      );

      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { school_id: mockSchoolId },
        relations: { school: true },
      });
    });

    it('should successfully return landing page when it exists', async () => {
      const landingPageWithSchool = {
        ...mockLandingPage,
        school: mockSchool,
      };
      landingPageModelAction.get.mockResolvedValue(
        landingPageWithSchool as LandingPage,
      );

      const result = await service.findOne(mockSchoolId);

      expect(result).toEqual({
        message: sysMsg.LANDING_PAGE_FETCHED_SUCCESSFULLY,
        ...landingPageWithSchool,
      });
      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { school_id: mockSchoolId },
        relations: { school: true },
      });
    });
  });

  describe('update', () => {
    const mockUpdateLandingPageDto: UpdateLandingPageDto = {
      hero: {
        heading: 'Updated Welcome Message',
        body: 'Updated body text.',
        cta_label: 'Contact Us',
        cta_href: '#contact',
        images: [
          {
            src: 'https://example.com/updated-hero.jpg',
            alt: 'Updated image',
          },
        ],
      },
    };

    it('should throw NotFoundException when landing page does not exist', async () => {
      landingPageModelAction.get.mockResolvedValue(null);

      await expect(
        service.update(mockLandingPageId, mockUpdateLandingPageDto),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.update(mockLandingPageId, mockUpdateLandingPageDto),
      ).rejects.toThrow(sysMsg.LANDING_PAGE_NOT_FOUND);

      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockLandingPageId },
      });
      expect(landingPageModelAction.update).not.toHaveBeenCalled();
    });

    it('should successfully update landing page when it exists', async () => {
      const updatedLandingPage = {
        ...mockLandingPage,
        hero: mockUpdateLandingPageDto.hero,
      };
      landingPageModelAction.get.mockResolvedValue(
        mockLandingPage as LandingPage,
      );
      landingPageModelAction.update.mockResolvedValue(
        updatedLandingPage as LandingPage,
      );

      const result = await service.update(
        mockLandingPageId,
        mockUpdateLandingPageDto,
      );

      expect(result).toEqual({
        message: sysMsg.LANDING_PAGE_UPDATED_SUCCESSFULLY,
        ...updatedLandingPage,
      });
      expect(landingPageModelAction.get).toHaveBeenCalledWith({
        identifierOptions: { id: mockLandingPageId },
      });
      expect(landingPageModelAction.update).toHaveBeenCalledWith({
        identifierOptions: { id: mockLandingPageId },
        updatePayload: mockUpdateLandingPageDto,
        transactionOptions: { useTransaction: false },
      });
    });
  });
});
