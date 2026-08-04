"use client";

import { useState, useRef, useEffect } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { SEARCH } from "@/lib/graphql";

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [search, { data, loading }] = useLazyQuery(SEARCH) as any;
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const userName = typeof window !== "undefined" ? localStorage.getItem("userName") : "";

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (q.length > 1) {
      search({ variables: { query: q } });
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  return (
    <nav className="glass sticky top-0 z-50 border-b border-[var(--border-subtle)]">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-[#6366f1] to-[#a78bfa] bg-clip-text text-transparent hidden sm:inline">
            TaskForge
          </span>
        </button>

        {/* Search */}
        <div ref={searchRef} className="relative flex-1 max-w-xl mx-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="global-search"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchQuery.length > 1 && setShowResults(true)}
              placeholder="Search issues..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>

          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto">
              {loading && <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Searching...</div>}
              {data?.search?.length === 0 && !loading && (
                <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>No results found</div>
              )}
              {data?.search?.map((result: any) => (
                <button
                  key={result.issueId}
                  onClick={() => {
                    router.push(`/issues/${result.issueId}`);
                    setShowResults(false);
                    setSearchQuery("");
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] last:border-0 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{result.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
                      {Math.round(result.similarity * 100)}% match
                    </span>
                  </div>
                  {result.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>{result.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#a78bfa] flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{(userName || "U")[0].toUpperCase()}</span>
          </div>
          <button
            id="logout-btn"
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:border-[var(--error)] hover:text-[var(--error)] transition-all cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
