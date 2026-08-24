import {
  Controller,
  Post,
  Body,
  HttpCode,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PubSubService } from '../services/pubsub.service';

@Controller('internal')
export class NotifyController {
  constructor(private pubSub: PubSubService) {}

  /**
   * POST /internal/notify
   * Receives notifications from core-service, publishes them via Redis pub/sub
   * and GraphQL subscriptions for real-time WebSocket delivery to connected clients.
   *
   * SEC-08 fix: requires X-Internal-Secret header matching INTERNAL_SECRET env var.
   * This prevents any external caller who knows a project ID from injecting arbitrary
   * events into clients' real-time feeds.
   */
  @Post('notify')
  @HttpCode(200)
  async notify(
    @Body() body: any,
    @Headers('x-internal-secret') secret: string,
  ) {
    const expectedSecret = process.env.INTERNAL_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid or missing internal secret');
    }

    const projectId = body.project_id || body.projectId;

    if (!projectId) {
      return { status: 'ignored', reason: 'no project_id' };
    }

    await this.pubSub.publish(projectId, {
      issue_id: body.issue_id || body.issueId,
      project_id: projectId,
      event_type: body.event_type || body.eventType,
      data: body.data || {},
    });

    return { status: 'published' };
  }
}
