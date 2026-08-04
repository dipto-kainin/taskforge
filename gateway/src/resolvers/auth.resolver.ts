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

  @Query()
  async organizations(@Context() context: any) {
    const orgs = await this.proxy.getOrganizations(context);
    return orgs.map((o: any) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
    }));
  }

  @Query()
  async organization(@Args('id') id: string, @Context() context: any) {
    const org = await this.proxy.getOrganization(id, context);
    if (!org) return null;

    const members = await this.proxy.getOrgMembers(id, context);
    return { ...org, members };
  }

  @Mutation()
  async createOrganization(@Args('input') input: any, @Context() context: any) {
    return this.proxy.createOrganization(input, context);
  }

  @Mutation()
  async inviteToOrg(
    @Args('orgId') orgId: string,
    @Args('email') email: string,
    @Args('role') role: string,
    @Context() context: any,
  ) {
    return this.proxy.inviteToOrg(orgId, email, role || 'member', context);
  }

  @Mutation()
  async createTeam(
    @Args('orgId') orgId: string,
    @Args('name') name: string,
    @Context() context: any,
  ) {
    return this.proxy.createTeam(orgId, name, context);
  }
}
