"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { GET_ORGANIZATIONS, CREATE_ORGANIZATION, GET_PROJECTS, CREATE_PROJECT } from "@/lib/graphql";

export default function DashboardPage() {
  const router = useRouter();
  const { data: orgData, loading: orgLoading, refetch: refetchOrgs } = useQuery(GET_ORGANIZATIONS) as any;
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const [createOrg] = useMutation(CREATE_ORGANIZATION);
  const [createProject] = useMutation(CREATE_PROJECT);

  const currentOrgId = selectedOrg || orgData?.organizations?.[0]?.id;
  const { data: projData, loading: projLoading, refetch: refetchProjects } = useQuery(GET_PROJECTS, {
    variables: { orgId: currentOrgId },
    skip: !currentOrgId,
  }) as any;

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    await createOrg({ variables: { input: { name: orgName, slug: orgSlug } } });
    setShowNewOrg(false);
    setOrgName("");
    setOrgSlug("");
    refetchOrgs();
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    await createProject({
      variables: { input: { orgId: currentOrgId, key: projectKey.toUpperCase(), name: projectName, description: projectDesc } },
    });
    setShowNewProject(false);
    setProjectName("");
    setProjectKey("");
    setProjectDesc("");
    refetchProjects();
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Org Selector */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Manage your organizations and projects</p>
          </div>
          <button
            onClick={() => setShowNewOrg(true)}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-medium hover:opacity-90 transition-all cursor-pointer"
          >
            + New Org
          </button>
        </div>

        {/* Org tabs */}
        {orgData?.organizations?.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {orgData.organizations.map((org: any) => (
              <button
                key={org.id}
                onClick={() => setSelectedOrg(org.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                  currentOrgId === org.id
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {org.name}
              </button>
            ))}
          </div>
        )}

        {/* Projects Grid */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Projects</h2>
          {currentOrgId && (
            <button
              onClick={() => setShowNewProject(true)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              + New Project
            </button>
          )}
        </div>

        {projLoading && <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading projects...</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projData?.projects?.map((project: any) => (
            <button
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}/board`)}
              className="glass rounded-xl p-5 text-left card-hover cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/20 border border-[var(--accent)]/30 flex items-center justify-center">
                  <span className="text-[var(--accent)] font-bold text-sm">{project.key}</span>
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{project.name}</h3>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{project.key}</span>
                </div>
              </div>
              {project.description && (
                <p className="text-sm line-clamp-2" style={{ color: "var(--text-secondary)" }}>{project.description}</p>
              )}
            </button>
          ))}
        </div>

        {!projLoading && projData?.projects?.length === 0 && (
          <div className="glass rounded-xl p-12 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No projects yet. Create your first project to get started.</p>
          </div>
        )}

        {/* New Org Modal */}
        {showNewOrg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass rounded-2xl p-6 w-full max-w-md animate-fadeIn">
              <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Create Organization</h3>
              <form onSubmit={handleCreateOrg} className="space-y-3">
                <input value={orgName} onChange={(e) => { setOrgName(e.target.value); setOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); }}
                  placeholder="Organization name" required
                  className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                <input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder="org-slug" required
                  className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowNewOrg(false)} className="flex-1 py-2 rounded-lg border border-[var(--border-color)] text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>Cancel</button>
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium cursor-pointer">Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* New Project Modal */}
        {showNewProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass rounded-2xl p-6 w-full max-w-md animate-fadeIn">
              <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Create Project</h3>
              <form onSubmit={handleCreateProject} className="space-y-3">
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project name" required
                  className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                <input value={projectKey} onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                  placeholder="KEY (e.g. TASK)" required maxLength={10}
                  className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                <textarea value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="Description (optional)" rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-all resize-none" />
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowNewProject(false)} className="flex-1 py-2 rounded-lg border border-[var(--border-color)] text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>Cancel</button>
                  <button type="submit" className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium cursor-pointer">Create</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
