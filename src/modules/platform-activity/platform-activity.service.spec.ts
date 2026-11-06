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
    settings.DB_NAME = 'sb_demo';
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
    query.mockResolvedValueOnce([{ last_staff_login_at: loginAt }]);
    query.mockResolvedValueOnce([
      { database_name: 'sb_demo', database_bytes: '1048576' },
    ]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("ARRAY['ADMIN', 'TEACHER']");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(settings.PLATFORM_ACTIVITY_URL);
    expect(options.headers.authorization).toBe(
      `Bearer ${settings.PLATFORM_SCHOOL_TOKEN}`,
    );
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual([
      'database_bytes',
      'database_name',
      'last_staff_login_at',
      'observed_at',
      'report_id',
    ]);
    expect(body.last_staff_login_at).toBe(loginAt.toISOString());
    expect(body.database_bytes).toBe(1048576);
  });

  it('does not interrupt activity reporting when the size query fails', async () => {
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    query.mockRejectedValueOnce(new Error('size unavailable'));
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('database_bytes');
  });

  it('does not repeat the size query in every five-minute report', async () => {
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    query.mockResolvedValueOnce([
      { database_name: 'sb_demo', database_bytes: '1048576' },
    ]);
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    expect(await service.reportOnce()).toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty(
      'database_bytes',
    );
  });

  it('retries the size reading if Platform rejects the first report', async () => {
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    query.mockResolvedValueOnce([
      { database_name: 'sb_demo', database_bytes: '1048576' },
    ]);
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    query.mockResolvedValueOnce([
      { database_name: 'sb_demo', database_bytes: '1048576' },
    ]);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    fetchMock.mockResolvedValueOnce({ ok: true });

    expect(await service.reportOnce()).toBe(false);
    expect(await service.reportOnce()).toBe(true);
    expect(query).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).database_bytes).toBe(
      1048576,
    );
  });

  it('refuses a size reading from a different database', async () => {
    query.mockResolvedValueOnce([{ last_staff_login_at: null }]);
    query.mockResolvedValueOnce([
      { database_name: 'sb_stpaul', database_bytes: '1048576' },
    ]);
    fetchMock.mockResolvedValue({ ok: true });

    expect(await service.reportOnce()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('database_bytes');
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
