import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type VerificationResponse = {
  result?: Array<{
    source_image_face?: unknown;
    face_matches?: Array<{ similarity?: number }>;
  }>;
};

@Injectable()
export class FaceVerificationService {
  constructor(private readonly config: ConfigService) {}

  get available(): boolean {
    return Boolean(
      this.endpoint() && this.config.get<string>('face.apiKey')?.trim(),
    );
  }

  get threshold(): number {
    const value = Number(
      this.config.get<string>('face.matchThreshold') ?? '0.8',
    );
    return Number.isFinite(value) && value >= 0.5 && value <= 1 ? value : 0.8;
  }

  private endpoint(): string | null {
    const configured = this.config.get<string>('face.verifyUrl')?.trim();
    if (!configured) return null;
    try {
      const url = new URL(configured);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return new URL('/api/v1/verification/verify', url).toString();
    } catch {
      return null;
    }
  }

  async verify(captured: Buffer, reference: Buffer): Promise<number> {
    const endpoint = this.endpoint();
    const key = this.config.get<string>('face.apiKey')?.trim();
    if (!endpoint || !key) {
      throw new ServiceUnavailableException(
        'Face verification is not configured',
      );
    }
    let response: Response;
    try {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('x-api-key', key);
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_image: captured.toString('base64'),
          target_image: reference.toString('base64'),
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Face verification service is unavailable',
      );
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 422) {
        throw new BadRequestException(
          'Show one clear face in each photo and try again',
        );
      }
      throw new ServiceUnavailableException(
        'Face verification service rejected the request',
      );
    }
    let result: VerificationResponse;
    try {
      result = (await response.json()) as VerificationResponse;
    } catch {
      throw new ServiceUnavailableException(
        'Face verification returned an invalid response',
      );
    }
    const faces = result.result;
    if (
      !Array.isArray(faces) ||
      faces.length !== 1 ||
      !faces[0].source_image_face
    ) {
      throw new BadRequestException(
        'Show exactly one clear face to the camera',
      );
    }
    const matches = faces[0].face_matches;
    if (!Array.isArray(matches) || matches.length !== 1) {
      throw new BadRequestException(
        'The enrolled photo must contain exactly one clear face',
      );
    }
    const similarity = matches[0].similarity;
    if (
      typeof similarity !== 'number' ||
      !Number.isFinite(similarity) ||
      similarity < 0 ||
      similarity > 1
    ) {
      throw new ServiceUnavailableException(
        'Face verification returned an invalid score',
      );
    }
    return similarity;
  }
}
