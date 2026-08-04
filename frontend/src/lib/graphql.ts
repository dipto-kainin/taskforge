"use client";

import { gql } from "@apollo/client/core";

// ---- Auth ----
export const REGISTER = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      accessToken
      refreshToken
      userId
      email
      name
    }
  }
`;

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      userId
      email
      name
    }
  }
`;

// ---- Organizations ----
export const GET_ORGANIZATIONS = gql`
  query GetOrganizations {
    organizations {
      id
      name
      slug
      createdAt
    }
  }
`;

export const CREATE_ORGANIZATION = gql`
  mutation CreateOrganization($input: CreateOrgInput!) {
    createOrganization(input: $input) {
      id
      name
      slug
    }
  }
`;

// ---- Projects ----
export const GET_PROJECTS = gql`
  query GetProjects($orgId: ID!) {
    projects(orgId: $orgId) {
      id
      orgId
      key
      name
      description
      createdAt
    }
  }
`;

export const CREATE_PROJECT = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      key
      name
    }
  }
`;

// ---- Board ----
export const GET_BOARD = gql`
  query GetBoard($projectId: ID!) {
    board(projectId: $projectId) {
      id
      name
      columns {
        id
        name
        position
        issues {
          id
          key
          title
          type
          status
          priority
          assigneeId
          columnId
          storyPoints
          labels {
            id
            name
            color
          }
        }
      }
    }
  }
`;

// ---- Issues ----
export const GET_ISSUE = gql`
  query GetIssue($id: ID!) {
    issue(id: $id) {
      id
      projectId
      key
      title
      description
      type
      status
      priority
      assigneeId
      reporterId
      sprintId
      columnId
      storyPoints
      createdAt
      updatedAt
      labels {
        id
        name
        color
      }
      comments {
        id
        authorId
        body
        createdAt
      }
      assignee {
        id
        name
        email
        avatarUrl
      }
      reporter {
        id
        name
        email
      }
    }
  }
`;

export const CREATE_ISSUE = gql`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      id
      key
      title
      status
      columnId
    }
  }
`;

export const UPDATE_ISSUE = gql`
  mutation UpdateIssue($id: ID!, $input: UpdateIssueInput!) {
    updateIssue(id: $id, input: $input) {
      id
      key
      title
      status
      columnId
      priority
      assigneeId
    }
  }
`;

export const CREATE_COMMENT = gql`
  mutation CreateComment($issueId: ID!, $body: String!) {
    createComment(issueId: $issueId, body: $body) {
      id
      authorId
      body
      createdAt
    }
  }
`;

// ---- Labels ----
export const GET_LABELS = gql`
  query GetLabels($projectId: ID!) {
    labels(projectId: $projectId) {
      id
      name
      color
    }
  }
`;

export const ADD_LABEL = gql`
  mutation AddLabel($issueId: ID!, $labelId: ID!) {
    addLabelToIssue(issueId: $issueId, labelId: $labelId)
  }
`;

// ---- Search ----
export const SEARCH = gql`
  query Search($query: String!, $projectId: String) {
    search(query: $query, projectId: $projectId) {
      issueId
      projectId
      title
      description
      similarity
    }
  }
`;

// ---- AI ----
export const DUPLICATE_CHECK = gql`
  mutation DuplicateCheck($input: DuplicateCheckInput!) {
    duplicateCheck(input: $input) {
      isDuplicate
      matches {
        issueId
        title
        similarity
      }
    }
  }
`;

// ---- Subscriptions ----
export const NOTIFICATION_SUBSCRIPTION = gql`
  subscription OnNotification($projectId: String!) {
    notificationReceived(projectId: $projectId) {
      issueId
      projectId
      eventType
      data
    }
  }
`;
