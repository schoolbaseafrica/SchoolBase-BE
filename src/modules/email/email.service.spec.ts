import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { EmailTemplateID } from '../../constants/email-constants';
import { School } from '../school/entities/school.entity';

import { EmailService } from './email.service';

describe('EmailService school logo', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'message-id' });
  const findOne = jest.fn();
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'mail.from.address') return 'mail@example.com';
      return undefined;
    }),
  };

  const createService = () => {
    const service = new EmailService(
      config as unknown as ConfigService,
      { findOne } as unknown as Repository<School>,
    );
    Object.assign(service, {
      transporter: { sendMail },
      compileTemplate: jest.fn(async (_name, data) => data.logo_url),
    });
    return service;
  };

  const payload = () => ({
    to: [{ email: 'ada@example.com' }],
    subject: 'Welcome',
    templateNameID: EmailTemplateID.INVITE,
    templateData: {
      logo_url: 'https://configured.example/fallback.png',
      school_name: 'Example School',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the logo uploaded in School Settings for account emails', async () => {
    findOne.mockResolvedValue({ logo_url: 'https://files.example/school.png' });
    const email = payload();

    await createService().sendMail(email);

    expect(findOne).toHaveBeenCalledWith({
      where: { installation_completed: true },
      select: { logo_url: true },
    });
    expect(sendMail.mock.calls[0][0].html).toBe(
      'https://files.example/school.png',
    );
    expect(email.templateData.logo_url).toBe(
      'https://configured.example/fallback.png',
    );
  });

  it('uses configured branding before the school has an uploaded logo', async () => {
    findOne.mockResolvedValue(null);

    await createService().sendMail(payload());

    expect(sendMail.mock.calls[0][0].html).toBe(
      'https://configured.example/fallback.png',
    );
  });

  it('does not query school branding for unrelated emails', async () => {
    await createService().sendMail({
      ...payload(),
      templateData: { name: 'Ada' },
    });

    expect(findOne).not.toHaveBeenCalled();
  });
});
