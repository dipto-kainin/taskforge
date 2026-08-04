import { Resolver, Query, Mutation, Subscription, Args, Context, ResolveField, Parent } from '@nestjs/graphql';
import { ProxyService } from '../services/proxy.service';
import { PubSubService } from '../services/pubsub.service';

@Resolver('Issue')
export class IssueResolver {
  constructor(
    private proxy: ProxyService,
    private pubSub: PubSubService,
  ) {}

  @Query()
  async issue(@Args('id') id: string, @Context() context: any) {
    const issue = await this.proxy.getIssue(id, context);
    return this.mapIssue(issue);
  }

  @Mutation()
  async createIssue(@Args('input') input: any, @Context() context: any) {
    const issue = await this.proxy.createIssue(input, context);
    return this.mapIssue(issue);
  }

  @Mutation()
  async updateIssue(
    @Args('id') id: string,
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const issue = await this.proxy.updateIssue(id, input, context);
    return this.mapIssue(issue);
  }

  @Mutation()
  async createComment(
    @Args('issueId') issueId: string,
    @Args('body') body: string,
    @Context() context: any,
  ) {
    const comment = await this.proxy.createComment(issueId, body, context);
    return {
      id: comment.id,
      issueId: comment.issue_id,
      authorId: comment.author_id,
      body: comment.body,
      createdAt: comment.created_at,
    };
  }

  @Mutation()
  async addLabelToIssue(
    @Args('issueId') issueId: string,
    @Args('labelId') labelId: string,
    @Context() context: any,
  ) {
    return this.proxy.addLabelToIssue(issueId, labelId, context);
  }

  @Subscription('notificationReceived', {
    filter: (payload: any, variables: any) => {
      return payload.notificationReceived.projectId === variables.projectId;
    },
  })
  notificationReceived(@Args('projectId') projectId: string) {
    return this.pubSub.getAsyncIterator(projectId);
  }

  @ResolveField('assignee')
  async resolveAssignee(@Parent() issue: any) {
    if (!issue.assigneeId) return null;
    return this.proxy.getUser(issue.assigneeId);
  }

  @ResolveField('reporter')
  async resolveReporter(@Parent() issue: any) {
    if (!issue.reporterId) return null;
    return this.proxy.getUser(issue.reporterId);
  }

  private mapIssue(issue: any) {
    return {
      id: issue.id,
      projectId: issue.project_id || issue.projectId,
      key: issue.key,
      title: issue.title,
      description: issue.description,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      assigneeId: issue.assignee_id || issue.assigneeId,
      reporterId: issue.reporter_id || issue.reporterId,
      sprintId: issue.sprint_id || issue.sprintId,
      columnId: issue.column_id || issue.columnId,
      storyPoints: issue.story_points || issue.storyPoints,
      parentIssueId: issue.parent_issue_id || issue.parentIssueId,
      createdAt: issue.created_at || issue.createdAt,
      updatedAt: issue.updated_at || issue.updatedAt,
      labels: issue.labels || [],
      comments: (issue.comments || []).map((c: any) => ({
        id: c.id,
        issueId: c.issue_id,
        authorId: c.author_id,
        body: c.body,
        createdAt: c.created_at,
      })),
    };
  }
}
