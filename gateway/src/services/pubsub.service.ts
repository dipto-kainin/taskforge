import { Injectable } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import Redis from 'ioredis';

@Injectable()
export class PubSubService {
  private pubSub: PubSub;
  private redisSub: Redis | null = null;
  private redisPub: Redis | null = null;

  constructor() {
    this.pubSub = new PubSub();

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redisSub = new Redis(redisUrl);
      this.redisPub = new Redis(redisUrl);

      this.redisSub.subscribe('taskforge:notifications', (err) => {
        if (err) {
          console.error('Redis subscribe error:', err);
        }
      });

      this.redisSub.on('message', (channel, message) => {
        if (channel === 'taskforge:notifications') {
          try {
            const notification = JSON.parse(message);
            const projectId = notification.project_id || notification.projectId;
            this.pubSub.publish(`notification:${projectId}`, {
              notificationReceived: {
                issueId: notification.issue_id || notification.issueId,
                projectId: projectId,
                eventType: notification.event_type || notification.eventType,
                data: JSON.stringify(notification.data || {}),
              },
            });
          } catch (e) {
            console.error('Failed to parse notification:', e);
          }
        }
      });

      console.log('Redis pub/sub connected');
    } catch (e) {
      console.warn('Redis not available, using in-memory pub/sub:', e);
    }
  }

  async publish(projectId: string, notification: any) {
    // Publish to Redis for cross-instance support
    if (this.redisPub) {
      try {
        await this.redisPub.publish(
          'taskforge:notifications',
          JSON.stringify(notification),
        );
      } catch (e) {
        console.warn('Redis publish failed, using in-memory:', e);
      }
    }

    // Also publish to in-memory for local subscriptions
    this.pubSub.publish(`notification:${projectId}`, {
      notificationReceived: {
        issueId: notification.issue_id || notification.issueId,
        projectId: projectId,
        eventType: notification.event_type || notification.eventType,
        data: JSON.stringify(notification.data || {}),
      },
    });
  }

  getAsyncIterator(projectId: string) {
    return this.pubSub.asyncIterator(`notification:${projectId}`);
  }
}
