import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { ProxyService } from '../services/proxy.service';

@Resolver()
export class AuthResolver {
  constructor(private proxy: ProxyService) {}

  @Mutation()
  async register(@Args('input') input: any) {
    // First register to get user
    const user = await this.proxy.register(input);

    // Then login to get tokens
    const tokens = await this.proxy.login({
      email: input.email,
      password: input.password,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId: user.id,
      email: user.email,
      name: user.name,
    };
  }

  @Mutation()
  async login(@Args('input') input: any) {
    const data = await this.proxy.login(input);
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: data.userId,
      email: data.email,
      name: data.name,
    };
  }

  @Mutation()
  async refreshToken(@Args('refreshToken') refreshToken: string) {
    return this.proxy.refreshToken(refreshToken);
  }
}
