import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './modules/common/error-filters/http-exception.filter';
import * as bodyParser from 'body-parser';
// import { Request, Response } from 'express';
import { json, urlencoded } from 'express';
import * as express from 'express';
// Load environment variables from .env file
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
   // ✅ Apply raw body middleware *ONLY* for Stripe webhook route
   app.use(
    '/api/v1/stripe/webhook',
    express.raw({ type: 'application/json' }) // Ensures Stripe gets raw body
  );

  // ✅ Apply JSON middleware *for other routes*
  app.use(bodyParser.json());
  // Global validation pipe configuration
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Enable CORS with configurations
  app.enableCors({
    origin: '*',
    credentials: false,
  });
  
  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());
  
  // Set global prefix for routes
  app.setGlobalPrefix('api/v1');
  
  // Get port from environment variables or default to 8000
  const port = process.env.PORT || 8000;
  
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
