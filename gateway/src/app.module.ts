import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';

import { AuthResolver } from './resolvers/auth.resolver';
import { ProjectResolver } from './resolvers/project.resolver';
import { IssueResolver } from './resolvers/issue.resolver';
import { SearchResolver } from './resolvers/search.resolver';
import { NotifyController } from './notify/notify.controller';
import { ProxyService } from './services/proxy.service';
import { PubSubService } from './services/pubsub.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: [join(__dirname, '**/*.graphql')],
      subscriptions: {
        // SEC-08: require a Bearer token in connectionParams before a WebSocket
        // subscription is established. Without this any unauthenticated client
        // could subscribe to any project's real-time event stream.
        'graphql-ws': {
          onConnect: (ctx: any) => {
            const authHeader =
              ctx.connectionParams?.authorization ||
              ctx.connectionParams?.Authorization;
            if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
              throw new Error(
                'Unauthorized: provide Authorization: Bearer <token> in connectionParams',
              );
            }
            // Full JWT validation happens at the resolver/guard level.
            // onConnect only gates the connection itself.
            return true;
          },
        },
      },
      playground: true,
      introspection: true,
      context: ({ req }) => ({ req }),
    }),
  ],
  controllers: [NotifyController, HealthController],
  providers: [
    AuthResolver,
    ProjectResolver,
    IssueResolver,
    SearchResolver,
    ProxyService,
    PubSubService,
  ],
})
export class AppModule {}
