import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailTransport } from './mail-transport';

/**
 * Development transport: writes each message to the API log, so the
 * confirmation link of a sign-up can be copied from there. No email
 * leaves the server.
 *
 * In production the body is NOT logged (it carries one-time sign-in
 * links); only a warning that the message was not delivered. A real
 * provider must be bound in MailModule before production (see
 * docs/pre-release-checklist.md).
 */
@Injectable()
export class ConsoleMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  constructor(
    private readonly production = process.env.NODE_ENV === 'production',
  ) {}

  send(message: MailMessage): Promise<void> {
    if (this.production) {
      this.logger.warn(
        `No mail provider configured: "${message.subject}" was not delivered.`,
      );
      return Promise.resolve();
    }
    this.logger.log(
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
    return Promise.resolve();
  }
}
