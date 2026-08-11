import { Controller, Get } from '@nestjs/common';
import axios from 'axios';

@Controller()
export class HealthController {
  private authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:8080';
  private coreUrl = process.env.CORE_SERVICE_URL || 'http://localhost:8081';
  private searchUrl = process.env.SEARCH_SERVICE_URL;

  @Get(['health', 'status', 'api/status'])
  async health() {
    const checkService = async (url: string, path: string) => {
      try {
        const res = await axios.get(`${url}${path}`, { timeout: 4000 });
        return res.status >= 200 && res.status < 400 ? 'ok' : 'error';
      } catch {
        return 'waking_up';
      }
    };

    const [authStatus, coreStatus, searchStatus] = await Promise.all([
      checkService(this.authUrl, '/.well-known/jwks.json'),
      checkService(this.coreUrl, '/health'),
      this.searchUrl ? checkService(this.searchUrl, '/health') : Promise.resolve('disabled'),
    ]);

    const criticalOk = authStatus === 'ok' && coreStatus === 'ok';

    return {
      status: criticalOk ? 'ok' : 'degraded',
      allHealthy: criticalOk,
      services: [
        { name: 'Gateway', status: 'ok', critical: true },
        { name: 'Auth Service', status: authStatus, critical: true },
        { name: 'Core Service', status: coreStatus, critical: true },
        { name: 'Search Service', status: searchStatus, critical: false },
      ],
    };
  }
}
