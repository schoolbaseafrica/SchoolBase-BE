import { ConfigService } from '@nestjs/config';

export function resolveTenantName(configService: ConfigService): string {
  return (
    configService.get<string>('school.name')?.trim() ||
    configService.get<string>('app.name')?.trim() ||
    'SchoolBase'
  );
}

export function resolveTenantLogo(configService: ConfigService): string {
  return (
    configService.get<string>('school.logoUrl')?.trim() ||
    configService.get<string>('app.logo_url')?.trim() ||
    ''
  );
}
