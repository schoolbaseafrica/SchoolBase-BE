import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import * as nunjucks from 'nunjucks';
import { Repository } from 'typeorm';

import { resolveTenantName } from '../../config/tenant-identity';
import { School } from '../school/entities/school.entity';

import { EmailPayload } from './email.types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(School)
    private readonly schools: Repository<School>,
  ) {
    // Initialize the transporter
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('mail.host'),
      port: this.configService.get<number>('mail.port'),
      secure: this.configService.get<number>('mail.port') === 465,

      auth: {
        user: this.configService.get<string>('mail.username'),
        pass: this.configService.get<string>('mail.password'),
      },
      pool: true,
      maxConnections: 5,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  /**
   * Compiles an email template using Nunjucks.
   * @param templateName The filename of the template (e.g., "welcome.njk")
   * @param context The data to inject
   * @returns The compiled HTML string
   */
  private async compileTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'templates',
      templateName,
    );

    try {
      const template = await fs.readFile(templatePath, 'utf-8');

      const fullContext = {
        ...context,
        copyRightYear: new Date().getFullYear(),
      };

      return nunjucks.renderString(template, fullContext);
    } catch (error) {
      this.logger.error(
        `Error reading or compiling template at: ${templatePath}`,
        error,
      );
      throw new Error('Could not load or compile email template.');
    }
  }

  /**
   * Sends an email using the provided payload.
   * This is the main public method for this service.
   * @param payload The EmailPayload object
   */
  async sendMail(payload: EmailPayload): Promise<void> {
    const { from, to, subject, templateNameID, templateData, text } = payload;

    // School Settings is the source of truth for the logo shown in the portal.
    // Use the same uploaded image in emails, falling back to the configured
    // identity during initial setup before a school record exists.
    const emailTemplateData = { ...templateData };
    if (Object.prototype.hasOwnProperty.call(emailTemplateData, 'logo_url')) {
      const school = await this.schools.findOne({
        where: { installation_completed: true },
        select: { logo_url: true },
      });
      if (school?.logo_url?.trim()) {
        emailTemplateData.logo_url = school.logo_url.trim();
      }
    }
    const html = await this.compileTemplate(templateNameID, emailTemplateData);

    const fromAddress =
      from?.email ?? this.configService.get<string>('mail.from.address');
    const fromName =
      from?.name?.trim() ||
      this.configService.get<string>('mail.from.name')?.trim() ||
      resolveTenantName(this.configService);

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName}" <${fromAddress}>`,
      to: to
        .map((t) => (t.name ? `"${t.name}" <${t.email}>` : t.email))
        .join(', '),
      subject: subject,
      html: html,
      text: text, // Optional plain-text version
    };

    // Send the email
    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent successfully to ${mailOptions.to}: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send email to ${mailOptions.to}`, error);
      throw error;
    }
  }
}
