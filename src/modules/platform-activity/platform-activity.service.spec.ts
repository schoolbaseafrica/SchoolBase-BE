import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { PlatformActivityService } from './platform-activity.service';

describe('PlatformActivityService', () => {
  const settings: Record<string, string> = {};
  const config = { get: jest.fn((key: string) => settings[key]) };
  const query = jest.fn();
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  let service: PlatformActivityService;

  beforeEach(() => {
    delete settings.SCHOOLBASE_IMAGE_REF;
    settings.PLATFORM_ACTIVITY_URL =
      'https://platform.example/school-signals/staff-login';
    settings.PLATFORM_SCHOOL_TOKEN = 'a'.repeat(64);
    query.mockReset();
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    service = new PlatformActivityService(
      { query } as unknown as DataSource,
      config as unknown as ConfigService,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('reports only the latest staff login timestamp without identifying users', async () => {
    const loginAt = new Date(Date.now() - 60_000);
    query.mockResolvedValue([{ last_staff_login_at: loginAt }]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("ARRAY['ADMIN', 'TEACHER']");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(settings.PLATFORM_ACTIVITY_URL);
    expect(options.headers.authorization).toBe(
      `Bearer ${settings.PLATFORM_SCHOOL_TOKEN}`,
    );
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual([
      'last_staff_login_at',
      'observed_at',
      'report_id',
    ]);
    expect(body.last_staff_login_at).toBe(loginAt.toISOString());
  });

  it('retries after a failed request on the next report', async () => {
    query.mockResolvedValue([{ last_staff_login_at: null }]);
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    fetchMock.mockResolvedValueOnce({ ok: true });
    expect(await service.reportOnce()).toBe(false);
    expect(await service.reportOnce()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports the configured Compose image through the existing school signal', async () => {
    settings.SCHOOLBASE_IMAGE_REF =
      'ghcr.io/donkross360/schoolbase:fe-abc-be-def';
    query.mockResolvedValue([{ last_staff_login_at: null }]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.image_ref).toBe(settings.SCHOOLBASE_IMAGE_REF);
  });

  it('keeps staff reporting active if the image reference is invalid', async () => {
    settings.SCHOOLBASE_IMAGE_REF = 'not-an-image';
    query.mockResolvedValue([{ last_staff_login_at: null }]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('image_ref');
  });

  it('does not query or send with invalid configuration', async () => {
    settings.PLATFORM_ACTIVITY_URL =
      'http://localhost/school-signals/staff-login';
    expect(await service.reportOnce()).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
