import { Module } from '@nestjs/common';
import { ConsoleMailTransport } from './console-mail-transport';
import { MAIL_TRANSPORT } from './mail-transport';

/** Binds the outgoing mail transport (console until a provider is chosen). */
@Module({
  providers: [
    { provide: MAIL_TRANSPORT, useFactory: () => new ConsoleMailTransport() },
  ],
  exports: [MAIL_TRANSPORT],
})
export class MailModule {}
