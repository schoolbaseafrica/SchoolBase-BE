import * as path from 'path';

import { ConfigService } from '@nestjs/config';
import * as nunjucks from 'nunjucks';

import { UserRole } from '../shared/enums';

import { AccountCreationService } from './account-creation.service';
import { EmailService } from './email.service';

describe('AccountCreationService branding', () => {
  const sendMail = jest.fn();
  const logger = { child: jest.fn().mockReturnValue({ info: jest.fn() }) };

  afterEach(() => jest.clearAllMocks());

  it('uses the school identity and renders its logo', async () => {
    const values: Record<string, string> = {
      ['frontend.url']: 'https://school.example',
      ['school.name']: 'Example School',
      ['school.logoUrl']: 'https://files.example/logo.png',
      ['app.name']: 'SchoolBase',
    };
    const config = { get: jest.fn((key: string) => values[key]) };
    const service = new AccountCreationService(
      logger as unknown as ConstructorParameters<
        typeof AccountCreationService
      >[0],
      config as unknown as ConfigService,
      { sendMail } as unknown as EmailService,
    );

    await service.sendAccountCreationEmail(
      'Ada',
      'ada@example.com',
      'temporary',
      UserRole.STUDENT,
      'token',
    );

    const payload = sendMail.mock.calls[0][0];
    expect(payload.subject).toContain('Example School');
    expect(payload.templateData.logo_url).toBe(
      'https://files.example/logo.png',
    );
    const html = nunjucks.render(
      path.join(__dirname, '../../templates/account-creation.njk'),
      payload.templateData,
    );
    expect(html).toContain('src="https://files.example/logo.png"');
  });

  it('does not render a broken logo image when none is configured', () => {
    for (const template of ['account-creation.njk', 'invite.njk']) {
      const html = nunjucks.render(
        path.join(__dirname, '../../templates', template),
        { school_name: 'Example School', logo_url: '' },
      );
      expect(html).not.toContain('<img src=""');
      expect(html).not.toContain('via.placeholder.com');
    }
  });
});
