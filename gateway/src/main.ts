import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // SEC-09: restrict CORS to the configured frontend origin only.
  // Wildcard origin + credentials=true is a CSRF risk — now locked to FRONTEND_URL.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // SEC-11: Content-Security-Policy to reduce XSS attack surface on localStorage tokens.
  // Restricts which scripts, styles, and connections are permitted by the browser.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `connect-src 'self' ${frontendUrl} wss:`,
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    next();
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Gateway running on http://localhost:${port}/graphql`);
}

bootstrap();
