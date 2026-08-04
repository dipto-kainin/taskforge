"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { GET_ISSUE, UPDATE_ISSUE, CREATE_COMMENT, DUPLICATE_CHECK } from "@/lib/graphql";

export default function IssueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const issueId = params.issueId as string;

  const { data, loading, refetch } = useQuery(GET_ISSUE, { variables: { id: issueId } }) as any;
  const [updateIssue] = useMutation(UPDATE_ISSUE);
  const [createComment] = useMutation(CREATE_COMMENT);
  const [duplicateCheck] = useMutation(DUPLICATE_CHECK);

  const [commentBody, setCommentBody] = useState("");
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [showDupCheck, setShowDupCheck] = useState(false);

  const issue = data?.issue;

  const handleStatusChange = async (status: string) => {
    await updateIssue({ variables: { id: issueId, input: { status } } });
    refetch();
  };

  const handlePriorityChange = async (priority: string) => {
    await updateIssue({ variables: { id: issueId, input: { priority } } });
    refetch();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    await createComment({ variables: { issueId, body: commentBody } });
    setCommentBody("");
    refetch();
  };

  const handleDuplicateCheck = async () => {
    setShowDupCheck(true);
    const dupResult = await duplicateCheck({
      variables: {
        input: {
          title: issue.title,
          description: issue.description || "",
          projectId: issue.projectId,
          threshold: 0.5,
        },
      },
    });
    const dupData = dupResult.data as any;
    setDuplicates(dupData?.duplicateCheck?.matches?.filter((m: any) => m.issueId !== issueId) || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse-glow w-10 h-10 rounded-lg bg-[var(--accent)]" />
        </div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p style={{ color: "var(--text-muted)" }}>Issue not found</p>
        </div>
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    bug: "#ef4444", task: "#3b82f6", story: "#22c55e", epic: "#a855f7",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <button onClick={() => router.back()}
          className="text-sm mb-4 px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer inline-block"
          style={{ color: "var(--text-muted)" }}>
          ← Back to board
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="animate-fadeIn">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: typeColors[issue.type] || "#6366f1" }}>
                  {issue.type[0]?.toUpperCase()}
                </span>
                <span className="text-sm font-mono" style={{ color: "var(--text-muted)" }}>{issue.key}</span>
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>{issue.title}</h1>
              {issue.description && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{issue.description}</p>
              )}
            </div>

            {/* Labels */}
            {issue.labels?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {issue.labels.map((label: any) => (
                  <span key={label.id} className="text-xs px-2.5 py-1 rounded-full border"
                    style={{ color: label.color, borderColor: label.color + "40", background: label.color + "15" }}>
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* AI Duplicate Check */}
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  <span className="text-base">🤖</span> AI Duplicate Detector
                </h3>
                <button onClick={handleDuplicateCheck}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all cursor-pointer">
                  Check Duplicates
                </button>
              </div>
              {showDupCheck && duplicates !== null && (
                <div className="mt-2">
                  {duplicates.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--success)" }}>✓ No similar issues found</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs" style={{ color: "var(--warning)" }}>⚠ Found {duplicates.length} similar issue(s):</p>
                      {duplicates.map((dup: any) => (
                        <button key={dup.issueId} onClick={() => router.push(`/issues/${dup.issueId}`)}
                          className="w-full text-left p-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-all cursor-pointer">
                          <div className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: "var(--text-primary)" }}>{dup.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning)]/10 text-[var(--warning)]">
                              {Math.round(dup.similarity * 100)}% match
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                Comments ({issue.comments?.length || 0})
              </h3>
              <div className="space-y-3 mb-4">
                {issue.comments?.map((comment: any, idx: number) => (
                  <div key={comment.id} className="glass rounded-lg p-3 animate-fadeIn" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6366f1] to-[#a78bfa] flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">U</span>
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{comment.body}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--accent)] transition-all" />
                <button type="submit"
                  className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-all cursor-pointer">
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="glass rounded-xl p-4 animate-slideIn space-y-4">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Status</label>
                <select value={issue.status} onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="backlog">Backlog</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Priority</label>
                <select value={issue.priority} onChange={(e) => handlePriorityChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Assignee</label>
                {issue.assignee ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6366f1] to-[#a78bfa] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">{issue.assignee.name[0]}</span>
                    </div>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{issue.assignee.name}</span>
                  </div>
                ) : (
                  <p className="text-sm px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]" style={{ color: "var(--text-muted)" }}>Unassigned</p>
                )}
              </div>

              {/* Reporter */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Reporter</label>
                {issue.reporter ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">{issue.reporter.name[0]}</span>
                    </div>
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{issue.reporter.name}</span>
                  </div>
                ) : (
                  <p className="text-sm px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]" style={{ color: "var(--text-muted)" }}>Unknown</p>
                )}
              </div>

              {/* Story Points */}
              {issue.storyPoints && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Story Points</label>
                  <span className="text-sm px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] block" style={{ color: "var(--text-primary)" }}>{issue.storyPoints}</span>
                </div>
              )}

              {/* Dates */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
                  <p>Created: {issue.createdAt ? new Date(issue.createdAt).toLocaleDateString() : "—"}</p>
                  <p>Updated: {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : "—"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
