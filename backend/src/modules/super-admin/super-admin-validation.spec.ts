import 'reflect-metadata';
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateTenantDto } from './dto/super-admin.dto';

/** The same pipe configuration main.ts installs globally. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const asBody = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

describe('super-admin request validation', () => {
  it('keeps every field of a valid create-tenant request', async () => {
    const body = {
      name: { uz: 'Orient Trading MCHJ', ru: 'ООО Orient Trading' },
      slug: 'orient-trading',
      plan: 'STARTER',
      trialDays: 14,
      adminEmail: 'admin@example.uz',
      adminFirstName: 'Ali',
      adminLastName: 'Valiyev',
    };
    await expect(
      pipe.transform(body, asBody(CreateTenantDto)),
    ).resolves.toEqual(expect.objectContaining(body));
  });

  it('rejects a create-tenant request without an admin email', async () => {
    await expect(
      pipe.transform(
        { name: 'X', slug: 'x', adminFirstName: 'A', adminLastName: 'B' },
        asBody(CreateTenantDto),
      ),
    ).rejects.toThrow();
  });
});
