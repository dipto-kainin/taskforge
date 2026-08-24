import { Controller, Get, OnModuleInit, Logger } from '@nestjs/common';
import axios from 'axios';

@Controller()
export class HealthController implements OnModuleInit {
  private authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:8080';
  private coreUrl = process.env.CORE_SERVICE_URL || 'http://localhost:8081';
  private externalServicesUrl = process.env.EXTERNAL_SERVICES_URL;

  private readonly logger = new Logger(HealthController.name);

  /**
   * Fired once when the NestJS application finishes bootstrapping.
   * Sends a fire-and-forget ping to each downstream service so that
   * Render free-tier instances start their cold-boot in parallel with
   * the gateway — rather than waiting for the first real user request.
   */
  onModuleInit() {
    const warmup = async (name: string, url: string, path: string) => {
      try {
        await axios.get(`${url}${path}`, { timeout: 60_000 });
        this.logger.log(`Warmup OK: ${name}`);
      } catch {
        this.logger.warn(`Warmup pending: ${name} (still waking up — will retry on first request)`);
      }
    };

    // Fire in background — don't block gateway startup
    warmup('auth-service',  this.authUrl,  '/.well-known/jwks.json');
    warmup('core-service',  this.coreUrl,  '/health');
    if (this.externalServicesUrl) {
      warmup('external-services', this.externalServicesUrl, '/health');
    }
  }

  @Get(['health', 'status', 'api/status'])
  async health() {
    const checkService = async (url: string, path: string) => {
      try {
        // 30s timeout — enough time for a cold-starting Render free instance
        const res = await axios.get(`${url}${path}`, { timeout: 30_000 });
        return res.status >= 200 && res.status < 400 ? 'ok' : 'error';
      } catch {
        return 'waking_up';
      }
    };

    const [authStatus, coreStatus, extServicesStatus] = await Promise.all([
      checkService(this.authUrl, '/.well-known/jwks.json'),
      checkService(this.coreUrl, '/health'),
      this.externalServicesUrl
        ? checkService(this.externalServicesUrl, '/health')
        : Promise.resolve('disabled'),
    ]);

    const criticalOk = authStatus === 'ok' && coreStatus === 'ok';
    const allHealthy = criticalOk && extServicesStatus !== 'error';

    return {
      status: criticalOk ? 'ok' : 'degraded',
      allHealthy,
      services: [
        { name: 'Gateway', status: 'ok', critical: true },
        { name: 'Auth Service', status: authStatus, critical: true },
        { name: 'Core Service', status: coreStatus, critical: true },
        { name: 'External Services', status: extServicesStatus, critical: false },
      ],
    };
  }
}
