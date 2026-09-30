import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * The mail port: self-hosted SMTP (Mailpit in development). `SMTP_URL=memory://` keeps messages
 * in memory instead, which is how the integration tests read invitation links.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger('MailService');
  private readonly transport: Transporter;
  private readonly from: string;
  readonly memory: MailMessage[] | undefined;

  constructor(config: AppConfig) {
    this.from = config.env.MAIL_FROM;
    if (config.env.SMTP_URL.startsWith('memory:')) {
      this.memory = [];
      this.transport = nodemailer.createTransport({ jsonTransport: true });
    } else {
      this.memory = undefined;
      this.transport = nodemailer.createTransport(config.env.SMTP_URL);
    }
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
    this.memory?.push(message);
    this.logger.debug({ subject: message.subject }, 'mail sent');
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
