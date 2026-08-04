import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { PubSubService } from '../services/pubsub.service';

@Controller('internal')
export class NotifyController {
  constructor(private pubSub: PubSubService) {}

  /**
   * POST /internal/notify
   * Receives notifications from core-service, publishes them via Redis pub/sub
   * and GraphQL subscriptions for real-time WebSocket delivery to connected clients.
   */
  @Post('notify')
  @HttpCode(200)
  async notify(@Body() body: any) {
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
