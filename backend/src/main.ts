import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL environment variable is not set. Terminating.');
    process.exit(1);
  }
  
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://admin.zesthealth.com',
    'https://superadmin.zesthealth.com',
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
