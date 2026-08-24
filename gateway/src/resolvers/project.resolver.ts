import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { ProxyService } from '../services/proxy.service';

@Resolver('Project')
export class ProjectResolver {
  constructor(private proxy: ProxyService) {}

  @Query()
  async myProjects(@Context() context: any) {
    const data = await this.proxy.getMyProjects(context);
    return data.map((p: any) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      createdAt: p.created_at,
      myRole: p.my_role,
    }));
  }

  @Query()
  async project(@Args('id') id: string, @Context() context: any) {
    const p = await this.proxy.getProject(id, context);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      createdAt: p.created_at,
    };
  }

  @Query()
  async projectMembers(@Args('projectId') projectId: string, @Context() context: any) {
    const members = await this.proxy.getProjectMembers(projectId, context);
    return members.map((m: any) => ({
      id: m.id,
      name: m.name || '',
      email: m.email || '',
      avatarUrl: m.avatar_url || null,
      role: m.role,
    }));
  }

  @Query()
  async board(@Args('projectId') projectId: string, @Context() context: any) {
    const b = await this.proxy.getBoard(projectId, context);
    return {
      id: b.id,
      name: b.name,
      columns: (b.columns || []).map((col: any) => ({
        id: col.id,
        name: col.name,
        position: col.position,
        issues: (col.issues || []).map((issue: any) => mapIssue(issue)),
      })),
    };
  }

  @Query()
  async labels(@Args('projectId') projectId: string, @Context() context: any) {
    return this.proxy.getLabels(projectId, context);
  }

  @Query()
  async dashboard(@Context() context: any) {
    const data = await this.proxy.getDashboard(context);

    const projects = (data.projects || []).map((p: any) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      createdAt: p.created_at,
      myRole: p.my_role,
    }));

    const tickets = (data.tickets || []).map((t: any) => mapIssue(t));

    const membersByProject = (data.members || []).map((entry: any) => ({
      projectId: entry.project_id,
      members: (entry.members || []).map((m: any) => ({
        id: m.id,
        name: m.name || '',
        email: m.email || '',
        avatarUrl: m.avatar_url || null,
        role: m.role,
      })),
    }));

    return { projects, tickets, membersByProject };
  }

  @Query()
  async activeJoinCode(@Args('projectId') projectId: string, @Context() context: any) {
    return this.proxy.getActiveJoinCode(projectId, context);
  }

  @Mutation()
  async createProject(@Args('input') input: any, @Context() context: any) {
    const p = await this.proxy.createProject(input, context);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
    };
  }

  @Mutation()
  async generateProjectJoinCode(
    @Args('projectId') projectId: string,
    @Args('durationMinutes') durationMinutes: number,
    @Args('override') override: boolean,
    @Context() context: any,
  ) {
    return this.proxy.generateProjectJoinCode(projectId, durationMinutes, override ?? false, context);
  }

  @Mutation()
  async joinProjectWithInvite(@Args('token') token: string, @Context() context: any) {
    const p = await this.proxy.joinProjectWithInvite(token, context);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
    };
  }

  @Mutation()
  async joinProjectWithCode(@Args('code') code: string, @Context() context: any) {
    const p = await this.proxy.joinProjectWithCode(code, context);
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
    };
  }

  @Mutation()
  async inviteToProject(
    @Args('projectId') projectId: string,
    @Args('email') email: string,
    @Args('role') role: string,
    @Context() context: any,
  ) {
    const m = await this.proxy.inviteToProject(projectId, email, role || 'member', context);
    return {
      id: m.id,
      name: m.name || '',
      email: m.email || '',
      avatarUrl: m.avatarUrl || m.avatar_url || null,
      role: m.role,
    };
  }

  @Mutation()
  async removeFromProject(
    @Args('projectId') projectId: string,
    @Args('userId') userId: string,
    @Context() context: any,
  ) {
    await this.proxy.removeFromProject(projectId, userId, context);
    return true;
  }

  @Mutation()
  async updateProjectMemberRole(
    @Args('projectId') projectId: string,
    @Args('userId') userId: string,
    @Args('role') role: string,
    @Context() context: any,
  ) {
    const m = await this.proxy.updateProjectMemberRole(projectId, userId, role, context);
    return {
      id: m.id,
      name: m.name || '',
      email: m.email || '',
      avatarUrl: m.avatar_url || null,
      role: m.role,
    };
  }

  @Mutation()
  async createSprint(
    @Args('projectId') projectId: string,
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const s = await this.proxy.createSprint(projectId, input, context);
    return {
      id: s.id,
      projectId: s.project_id,
      name: s.name,
      startDate: s.start_date,
      endDate: s.end_date,
      status: s.status,
    };
  }

  @Mutation()
  async updateSprint(
    @Args('id') id: string,
    @Args('status') status: string,
    @Context() context: any,
  ) {
    await this.proxy.updateSprint(id, status, context);
    return { id, status };
  }

  @Mutation()
  async createLabel(
    @Args('projectId') projectId: string,
    @Args('name') name: string,
    @Args('color') color: string,
    @Context() context: any,
  ) {
    return this.proxy.createLabel(projectId, name, color, context);
  }
}

function mapIssue(issue: any) {
  return {
    id: issue.id,
    projectId: issue.project_id,
    key: issue.key,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assignee_id,
    reporterId: issue.reporter_id,
    sprintId: issue.sprint_id,
    columnId: issue.column_id,
    storyPoints: issue.story_points,
    parentIssueId: issue.parent_issue_id,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    labels: issue.labels || [],
    comments: issue.comments || [],
  };
}
