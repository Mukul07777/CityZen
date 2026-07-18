"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { Messaging } from "react-cssfx-loading";
import ErrorBoundary from "../Components/ErrorBoundary";
import { logError } from "../lib/logError";

const IssuesMap = dynamic(() => import("../Components/IssuesMap"), { ssr: false });

// Public, read-only view — no login required. Relies on the "posts are
// readable by anon" / "districts are readable by anon" policies added in
// supabase/migration_6_notifications_public_access.sql. No report, vote,
// or complete actions here on purpose: this page exists so anyone (a
// journalist, a municipal stakeholder, a curious resident) can see that
// the system is real and active without needing an account.
const BrowsePage = () => {
  const [issues, setIssues] = useState([]);
  const [load, setLoad] = useState(true);
  const [tagFilter, setTagFilter] = useState("all");
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'map'
  const [fetchError, setFetchError] = useState(false);

  const loadIssues = async () => {
    const { data: rows, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60);

    if (error) {
      logError("browse/page.jsx:loadIssues", error);
      setFetchError(true);
      setLoad(false);
      return;
    }
    setFetchError(false);
    setIssues(rows);
    setLoad(false);
  };

  useEffect(() => {
    loadIssues();
  }, []);

  const timeAgo = (isoString) => {
    const ms = new Date(isoString).getTime();
    const diff = Date.now() - ms;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
  };

  const visible = issues.filter((i) => tagFilter === "all" || i.tag === tagFilter);

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-navy">What's Being Reported</h1>
            <p className="text-navy/50 text-sm mt-1">
              Public view — sign up to report an issue or vote on one.
            </p>
          </div>
          <Link
            href="/signup"
            className="px-5 py-2.5 bg-navy text-cream font-semibold rounded-lg hover:bg-navy-light transition"
          >
            Sign Up to Participate
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-navy/70">Filter:</label>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="p-2 border border-navy/20 rounded-md text-navy bg-cream-card"
            >
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div className="inline-flex rounded-lg border border-navy/20 p-1 bg-cream-card w-fit">
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                viewMode === "list" ? "bg-navy text-cream" : "text-navy/60"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                viewMode === "map" ? "bg-navy text-cream" : "text-navy/60"
              }`}
            >
              Map
            </button>
          </div>
        </div>

        {load ? (
          <div className="flex items-center justify-center h-[40vh]">
            <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
          </div>
        ) : fetchError ? (
          <div className="text-center mt-16">
            <p className="text-navy/70 font-medium mb-3">
              Couldn't load issues right now — this has been logged.
            </p>
            <button
              onClick={() => {
                setLoad(true);
                loadIssues();
              }}
              className="px-5 py-2 rounded-lg bg-navy text-cream font-semibold hover:bg-navy-light transition"
            >
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-navy/40 text-center mt-16">No issues to show yet.</p>
        ) : viewMode === "map" ? (
          <IssuesMap issues={visible} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl shadow-sm bg-cream-card overflow-hidden border-t-4 ${
                  issue.tag === "Pending" ? "border-gold" : "border-navy"
                }`}
              >
                <img
                  src={issue.img_url}
                  alt={issue.title}
                  className="w-full h-[180px] object-cover"
                />
                <div className="p-5">
                  <h2 className="text-lg font-semibold text-navy mb-1">{issue.title}</h2>
                  <p className="text-navy/60 text-sm mb-3">{issue.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full text-cream ${
                        issue.tag === "Pending" ? "bg-gold" : "bg-navy"
                      }`}
                    >
                      {issue.tag}
                    </span>
                    <span className="text-xs px-3 py-1 rounded-full bg-navy/5 text-navy/60">
                      {issue.issue_category}
                    </span>
                  </div>
                  <p className="text-navy/50 text-xs">
                    {issue.district} · {timeAgo(issue.created_at)}
                  </p>
                  <Link
                    href={`/issues/${issue.id}`}
                    className="inline-block mt-2 text-xs font-semibold text-navy underline"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BrowsePageWithBoundary = () => (
  <ErrorBoundary context="browse/page.jsx">
    <BrowsePage />
  </ErrorBoundary>
);

export default BrowsePageWithBoundary;
