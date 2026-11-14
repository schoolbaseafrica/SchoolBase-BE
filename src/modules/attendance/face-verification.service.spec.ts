import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { FaceVerificationService } from './face-verification.service';

describe('FaceVerificationService', () => {
  const values = new Map([
    ['face.verifyUrl', 'http://compreface:8000'],
    ['face.apiKey', 'test-key'],
    ['face.matchThreshold', '0.8'],
  ]);
  const service = new FaceVerificationService({
    get: (key: string) => values.get(key),
  } as never);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends two images to the configured provider and reads its score', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          {
            source_image_face: { box: {} },
            face_matches: [{ similarity: 0.92 }],
          },
        ],
      }),
    });
    const score = await service.verify(
      Buffer.from('live'),
      Buffer.from('reference'),
    );
    expect(score).toBe(0.92);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://compreface:8000/api/v1/verification/verify');
    expect(options.headers.get('x-api-key')).toBe('test-key');
    expect(JSON.parse(options.body)).toEqual({
      source_image: Buffer.from('live').toString('base64'),
      target_image: Buffer.from('reference').toString('base64'),
    });
  });

  it('rejects images with multiple faces', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          {
            source_image_face: {},
            face_matches: [{ similarity: 0.9 }, { similarity: 0.8 }],
          },
        ],
      }),
    });
    await expect(
      service.verify(Buffer.from('a'), Buffer.from('b')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed when the provider is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(
      service.verify(Buffer.from('a'), Buffer.from('b')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
