import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { ProxyService } from '../services/proxy.service';

@Resolver()
export class SearchResolver {
  constructor(private proxy: ProxyService) {}

  @Query()
  async search(
    @Args('query') query: string,
    @Args('projectId') projectId: string,
    @Context() context: any,
  ) {
    const results = await this.proxy.search(query, projectId, context);
    return results.map((r: any) => ({
      issueId: r.issue_id,
      projectId: r.project_id,
      title: r.title,
      description: r.description,
      similarity: r.similarity,
    }));
  }

  @Mutation()
  async duplicateCheck(@Args('input') input: any) {
    const result = await this.proxy.duplicateCheck(input);
    return {
      isDuplicate: result.is_duplicate,
      matches: (result.matches || []).map((m: any) => ({
        issueId: m.issue_id,
        projectId: m.project_id,
        title: m.title,
        description: m.description,
        similarity: m.similarity,
      })),
    };
  }

  @Mutation()
  async suggestLabels(@Args('input') input: any) {
    const result = await this.proxy.suggestLabels(input);
    return {
      suggestions: result.suggestions || [],
    };
  }

  @Mutation()
  async summarizeComments(
    @Args('issueId') issueId: string,
    @Args('comments') comments: any[],
  ) {
    const result = await this.proxy.summarizeComments(issueId, comments);
    return {
      summary: result.summary,
      commentCount: result.comment_count,
    };
  }
}
