/**
 * Provider-agnostic outgoing mail (D3). Code that sends email depends on
 * `MailTransport` through the `MAIL_TRANSPORT` token only; a real provider
 * (SMTP, an HTTP mail API) is a new class implementing it, bound in
 * `MailModule`. Until one is chosen, `ConsoleMailTransport` writes messages
 * to the API log.
 */
export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. */
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');
