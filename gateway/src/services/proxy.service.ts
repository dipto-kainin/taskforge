import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { GraphQLError } from 'graphql';

@Injectable()
export class ProxyService {
  private authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:8080';
  private coreUrl = process.env.CORE_SERVICE_URL || 'http://localhost:8081';
  private searchUrl = process.env.SEARCH_SERVICE_URL || 'http://localhost:8000';

  constructor() {
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error) && error.response) {
          const status = error.response.status;
          const data = error.response.data;
          const message =
            typeof data === 'object' && data?.error
              ? data.error
              : error.message;

          const isAuthEndpoint =
            error.config?.url?.includes('/api/auth/login') ||
            error.config?.url?.includes('/api/auth/register');

          if (status === 401 || status === 403 || status === 400) {
            const prefix = isAuthEndpoint ? '' : 'JWT failed: ';
            throw new GraphQLError(`${prefix}${message}`, {
              extensions: {
                code: status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED',
                status,
                originalError: data,
              },
            });
          }
        }
        return Promise.reject(error);
      },
    );
  }

  private getHeaders(context: any): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const req = context?.req;
    if (req?.headers?.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    return headers;
  }

  // ---- Auth Service ----

  async register(input: any) {
    const { data } = await axios.post(`${this.authUrl}/api/auth/register`, input);
    return data;
  }

  async login(input: any) {
    const { data } = await axios.post(`${this.authUrl}/api/auth/login`, input);
    return data;
  }

  async refreshToken(refreshToken: string) {
    const { data } = await axios.post(`${this.authUrl}/api/auth/refresh`, { refreshToken });
    return data;
  }

  async getUser(userId: string) {
    try {
      const { data } = await axios.get(`${this.authUrl}/api/users/${userId}`);
      return data;
    } catch {
      return null;
    }
  }

  async getOrganizations(context: any) {
    const { data } = await axios.get(`${this.authUrl}/api/orgs`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async getOrganization(id: string, context: any) {
    const { data } = await axios.get(`${this.authUrl}/api/orgs`, {
      headers: this.getHeaders(context),
    });
    const org = data.find((o: any) => o.id === id);
    return org || null;
  }

  async createOrganization(input: any, context: any) {
    const { data } = await axios.post(`${this.authUrl}/api/orgs`, input, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async inviteToOrg(orgId: string, email: string, role: string, context: any) {
    const { data } = await axios.post(
      `${this.authUrl}/api/orgs/${orgId}/invite`,
      { email, role },
      { headers: this.getHeaders(context) },
    );
    return data;
  }

  async removeFromOrg(orgId: string, userId: string, context: any) {
    const { data } = await axios.delete(
      `${this.authUrl}/api/orgs/${orgId}/members/${userId}`,
      { headers: this.getHeaders(context) },
    );
    return data;
  }

  async updateMemberRole(orgId: string, userId: string, role: string, context: any) {
    const { data } = await axios.patch(
      `${this.authUrl}/api/orgs/${orgId}/members/${userId}`,
      { role },
      { headers: this.getHeaders(context) },
    );
    return data;
  }

  async getOrgMembers(orgId: string, context: any) {
    const { data } = await axios.get(`${this.authUrl}/api/orgs/${orgId}/members`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async createTeam(orgId: string, name: string, context: any) {
    const { data } = await axios.post(
      `${this.authUrl}/api/orgs/${orgId}/teams`,
      { name },
      { headers: this.getHeaders(context) },
    );
    return data;
  }

  // ---- Core Service ----

  async getProjects(orgId: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/orgs/${orgId}/projects`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async getProject(id: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/projects/${id}`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async createProject(input: any, context: any) {
    const { data } = await axios.post(`${this.coreUrl}/api/projects`, {
      org_id: input.orgId,
      key: input.key,
      name: input.name,
      description: input.description || '',
    }, { headers: this.getHeaders(context) });
    return data;
  }

  async generateProjectJoinCode(projectId: string, durationMinutes: number, context: any) {
    const { data } = await axios.post(
      `${this.coreUrl}/api/projects/${projectId}/join-codes`,
      { duration_minutes: durationMinutes },
      { headers: this.getHeaders(context) },
    );
    return {
      code: data.code,
      expiresAt: data.expires_at,
    };
  }

  async joinProjectWithCode(code: string, context: any) {
    const { data } = await axios.post(
      `${this.coreUrl}/api/projects/join`,
      { code },
      { headers: this.getHeaders(context) },
    );
    return data;
  }

  async getBoard(projectId: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/projects/${projectId}/board`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async createSprint(projectId: string, input: any, context: any) {
    const { data } = await axios.post(`${this.coreUrl}/api/projects/${projectId}/sprints`, {
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
    }, { headers: this.getHeaders(context) });
    return data;
  }

  async updateSprint(id: string, status: string, context: any) {
    const { data } = await axios.patch(`${this.coreUrl}/api/sprints/${id}`, { status }, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async getIssue(id: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/issues/${id}`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async createIssue(input: any, context: any) {
    const { data } = await axios.post(`${this.coreUrl}/api/issues`, {
      project_id: input.projectId,
      title: input.title,
      description: input.description || '',
      type: input.type || 'task',
      priority: input.priority || 'medium',
      assignee_id: input.assigneeId || '',
      sprint_id: input.sprintId || '',
      story_points: input.storyPoints,
      parent_issue_id: input.parentIssueId || '',
    }, { headers: this.getHeaders(context) });
    return data;
  }

  async updateIssue(id: string, input: any, context: any) {
    const body: any = {};
    if (input.title !== undefined) body.title = input.title;
    if (input.description !== undefined) body.description = input.description;
    if (input.status !== undefined) body.status = input.status;
    if (input.columnId !== undefined) body.column_id = input.columnId;
    if (input.assigneeId !== undefined) body.assignee_id = input.assigneeId;
    if (input.sprintId !== undefined) body.sprint_id = input.sprintId;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.storyPoints !== undefined) body.story_points = input.storyPoints;

    await axios.patch(`${this.coreUrl}/api/issues/${id}`, body, {
      headers: this.getHeaders(context),
    });

    // Return the updated issue
    return this.getIssue(id, context);
  }

  async createComment(issueId: string, body: string, context: any) {
    const { data } = await axios.post(`${this.coreUrl}/api/issues/${issueId}/comments`, { body }, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async getComments(issueId: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/issues/${issueId}/comments`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async createLabel(projectId: string, name: string, color: string, context: any) {
    const { data } = await axios.post(`${this.coreUrl}/api/projects/${projectId}/labels`, {
      name,
      color: color || '#6366f1',
    }, { headers: this.getHeaders(context) });
    return data;
  }

  async getLabels(projectId: string, context: any) {
    const { data } = await axios.get(`${this.coreUrl}/api/projects/${projectId}/labels`, {
      headers: this.getHeaders(context),
    });
    return data;
  }

  async addLabelToIssue(issueId: string, labelId: string, context: any) {
    await axios.post(`${this.coreUrl}/api/issues/${issueId}/labels`, {
      label_id: labelId,
    }, { headers: this.getHeaders(context) });
    return true;
  }

  // ---- Search Service (optional — gracefully disabled if SEARCH_SERVICE_URL not set) ----

  private get searchEnabled(): boolean {
    return !!process.env.SEARCH_SERVICE_URL;
  }

  async search(query: string, projectId: string | null, context: any) {
    if (!this.searchEnabled) return [];
    try {
      const params: any = { q: query };
      if (projectId) params.project_id = projectId;
      const { data } = await axios.get(`${this.searchUrl}/api/search`, {
        params,
        headers: this.getHeaders(context),
      });
      return data;
    } catch {
      return [];
    }
  }

  async duplicateCheck(input: any) {
    if (!this.searchEnabled) return { is_duplicate: false, matches: [] };
    try {
      const { data } = await axios.post(`${this.searchUrl}/api/ai/duplicate-check`, {
        title: input.title,
        description: input.description || '',
        project_id: input.projectId,
        threshold: input.threshold || 0.7,
      });
      return data;
    } catch {
      return { is_duplicate: false, matches: [] };
    }
  }

  async suggestLabels(input: any) {
    if (!this.searchEnabled) return { suggestions: [] };
    try {
      const { data } = await axios.post(`${this.searchUrl}/api/ai/suggest-labels`, {
        title: input.title,
        description: input.description || '',
        project_id: input.projectId,
      });
      return data;
    } catch {
      return { suggestions: [] };
    }
  }

  async summarizeComments(issueId: string, comments: any[]) {
    if (!this.searchEnabled) return { summary: 'Search service unavailable.', comment_count: comments.length };
    try {
      const { data } = await axios.post(`${this.searchUrl}/api/ai/summarize-comments`, {
        issue_id: issueId,
        comments,
      });
      return data;
    } catch {
      return { summary: 'Search service unavailable.', comment_count: comments.length };
    }
  }
}
