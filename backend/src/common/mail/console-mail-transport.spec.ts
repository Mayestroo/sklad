import { Logger } from '@nestjs/common';
import { ConsoleMailTransport } from './console-mail-transport';

describe('ConsoleMailTransport', () => {
  const message = {
    to: 'owner@example.com',
    subject: 'Confirm',
    text: 'https://app.example.uz/uz/register/confirm?token=secret-token',
  };
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the whole message to the log in development', async () => {
    await new ConsoleMailTransport(false).send(message);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('token=secret-token'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('owner@example.com'),
    );
  });

  it('never logs the body (one-time links) in production', async () => {
    await new ConsoleMailTransport(true).send(message);
    const written = [...log.mock.calls, ...warn.mock.calls].flat().join(' ');
    expect(written).not.toContain('secret-token');
    expect(written).not.toContain('owner@example.com');
    expect(warn).toHaveBeenCalled();
  });
});
