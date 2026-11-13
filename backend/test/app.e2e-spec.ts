import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { useTestDatabase } from './use-test-database';
import { AppModule } from './../src/app.module';

useTestDatabase();

describe('HTTP smoke test (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health reports the API and database as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      services: { database: 'ok' },
    });
  });

  it('rejects tenant-scoped routes without a token', async () => {
    await request(app.getHttpServer()).get('/api/finance/accounts').expect(401);
  });
});
