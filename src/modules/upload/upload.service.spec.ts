import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

import { IMulterFile } from '../../common/types/multer.types';
import * as sysMsg from '../../constants/system.messages';

import { MinioService } from './services/minio.service';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let minioService: MinioService;

  const mockMinioService = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
    downloadFile: jest.fn(),
  };

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };

  const mockFile: IMulterFile = {
    fieldname: 'file',
    originalname: 'test-image.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 102400,
    buffer: Buffer.from('fake-image-data'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: MinioService,
          useValue: mockMinioService,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    minioService = module.get<MinioService>(MinioService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadPicture', () => {
    it('rejects a missing file with a client error', async () => {
      await expect(
        service.uploadPicture(undefined as unknown as IMulterFile),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(minioService.uploadImage).not.toHaveBeenCalled();
    });
    it('should upload a picture successfully with userId', async () => {
      const userId = 'user-uuid-123';
      const mockUploadResult = {
        url: 'https://minio.deenai.app/schoolbase-uploads/test-image.jpg',
        publicId: 'schoolbase-users/user-uuid-123/test-image',
      };

      mockMinioService.uploadImage.mockResolvedValue(mockUploadResult);

      const result = await service.uploadPicture(mockFile, userId);

      expect(minioService.uploadImage).toHaveBeenCalledWith(
        mockFile,
        `schoolbase-users/${userId}`,
      );
      expect(result).toEqual({
        url: mockUploadResult.url,
        publicId: mockUploadResult.publicId,
        originalName: mockFile.originalname,
        size: mockFile.size,
        mimetype: mockFile.mimetype,
      });
    });

    it('should upload a picture successfully without userId', async () => {
      const mockUploadResult = {
        url: 'https://minio.deenai.app/schoolbase-uploads/test-image.jpg',
        publicId: 'schoolbase-uploads/test-image',
      };

      mockMinioService.uploadImage.mockResolvedValue(mockUploadResult);

      const result = await service.uploadPicture(mockFile);

      expect(minioService.uploadImage).toHaveBeenCalledWith(
        mockFile,
        'schoolbase-uploads',
      );
      expect(result).toEqual({
        url: mockUploadResult.url,
        publicId: mockUploadResult.publicId,
        originalName: mockFile.originalname,
        size: mockFile.size,
        mimetype: mockFile.mimetype,
      });
    });

    it('should throw error when Minio upload fails', async () => {
      const error = new BadRequestException(sysMsg.IMAGE_UPLOAD_FAILED);
      mockMinioService.uploadImage.mockRejectedValue(error);

      await expect(service.uploadPicture(mockFile)).rejects.toThrow(
        BadRequestException,
      );
      expect(minioService.uploadImage).toHaveBeenCalled();
    });

    it('should propagate errors from MinioService', async () => {
      const error = new BadRequestException(sysMsg.FILE_TOO_LARGE);
      mockMinioService.uploadImage.mockRejectedValue(error);

      await expect(service.uploadPicture(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it('stores receipts under a private object prefix', async () => {
    mockMinioService.uploadImage.mockResolvedValue({
      url: 'https://files.schoolbase.africa/demo/receipts/receipt.pdf',
      publicId: 'receipts/receipt.pdf',
    });
    const file = { ...mockFile, mimetype: 'application/pdf' };
    const result = await service.uploadReceipt(file);
    expect(minioService.uploadImage).toHaveBeenCalledWith(file, 'receipts');
    expect(result.publicId).toBe('receipts/receipt.pdf');
  });

  it('reads only receipt objects through the receipt download method', async () => {
    const buffer = Buffer.from('%PDF-1.7');
    mockMinioService.downloadFile.mockResolvedValue(buffer);
    const url =
      'https://files.example/demo/receipts/20a06a46-407a-4ee1-a395-17ddc20f8137.pdf';
    await expect(service.downloadReceipt(url)).resolves.toEqual({
      buffer,
      mimeType: 'application/pdf',
    });
    expect(minioService.downloadFile).toHaveBeenCalledWith(
      'receipts/20a06a46-407a-4ee1-a395-17ddc20f8137.pdf',
    );
    await expect(
      service.downloadReceipt(
        'https://files.example/demo/assignments/secret.pdf',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
