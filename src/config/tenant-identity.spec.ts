import { ConfigService } from '@nestjs/config';

import { resolveTenantLogo, resolveTenantName } from './tenant-identity';

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('tenant identity', () => {
  it('uses the configured school name and logo', () => {
    const service = config({
      ['school.name']: ' SchoolBase Demo ',
      ['school.logoUrl']: ' https://files.example/demo.svg ',
      ['app.name']: 'SchoolBase',
    });

    expect(resolveTenantName(service)).toBe('SchoolBase Demo');
    expect(resolveTenantLogo(service)).toBe('https://files.example/demo.svg');
  });

  it('falls back to the application identity when school branding is blank', () => {
    const service = config({
      ['school.name']: ' ',
      ['school.logoUrl']: '',
      ['app.name']: 'SchoolBase',
      ['app.logo_url']: 'https://files.example/schoolbase.svg',
    });

    expect(resolveTenantName(service)).toBe('SchoolBase');
    expect(resolveTenantLogo(service)).toBe(
      'https://files.example/schoolbase.svg',
    );
  });
});
