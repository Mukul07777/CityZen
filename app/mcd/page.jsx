"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { Messaging } from "react-cssfx-loading";
import ErrorBoundary from "../Components/ErrorBoundary";
import { logError } from "../lib/logError";

const McdDashboardPage = () => {
  const router = useRouter();
  const [profile, setProfile] = useState(null); // null = still checking
  const [issues, setIssues] = useState([]);
  const [load, setLoad] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [tagFilter, setTagFilter] = useState("all");
  const [completingId, setCompletingId] = useState(null);
  const [markingSeenId, setMarkingSeenId] = useState(null);
  const [duplicatePairs, setDuplicatePairs] = useState([]);
  const [mergingPairId, setMergingPairId] = useState(null);
  const fileInputRef = useRef(null);

  // Gate: must be logged in AND role === 'mcd'. Anyone else gets bounced —
  // this is a UI-level redirect only; the real enforcement is server-side
  // in complete_issue() (see supabase/migration_2_mcd_roles.sql), so even
  // if someone bypasses this page they still can't act on issues outside
  // their district.
  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }
      const { data: row, error } = await supabase
        .from("profiles")
        .select("role, district")
        .eq("id", session.user.id)
        .single();
      if (error || !row || row.role !== "mcd") {
        router.push("/issues");
        return;
      }
      setProfile(row);
    };
    checkAccess();
  }, [router]);

  const loadIssues = async (district) => {
    const { data: rows, error } = await supabase
      .from("posts")
      .select("*")
      .eq("district", district)
      .order("created_at", { ascending: false });

    if (error) {
      logError("mcd/page.jsx:loadIssues", error);
      setFetchError(true);
      setLoad(false);
      return;
    }
    setFetchError(false);

    // Same priority ordering as the citizen Issues page: issues reported
    // by more people surface first, then oldest-first within that.
    const sorted = [...rows].sort((a, b) => {
      if (b.report_count !== a.report_count) return b.report_count - a.report_count;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    setIssues(sorted);
    setLoad(false);
  };

  useEffect(() => {
    if (!profile?.district) return;
    loadIssues(profile.district);

    const channel = supabase
      .channel("mcd-posts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `district=eq.${profile.district}` },
        () => loadIssues(profile.district)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile?.district]);

  // Possible-duplicates review queue (migration_11_duplicate_review.sql):
  // pairs with photo similarity too weak to auto-merge (hamming distance
  // 11-25) but close enough that a human glance is worth it.
  const loadDuplicates = async (district) => {
    const { data, error } = await supabase
      .from("possible_duplicate_pairs")
      .select("*")
      .eq("district", district)
      .order("distance", { ascending: true });
    if (!error && data) setDuplicatePairs(data);
  };

  useEffect(() => {
    if (!profile?.district) return;
    loadDuplicates(profile.district);
  }, [profile?.district]);

  const handleMerge = async (pair) => {
    setMergingPairId(pair.post_a_id + pair.post_b_id);
    try {
      const { error } = await supabase.rpc("merge_duplicate_posts", {
        p_keep_id: pair.post_a_id,
        p_merge_id: pair.post_b_id,
      });
      if (error) throw error;
      setDuplicatePairs((prev) =>
        prev.filter((p) => !(p.post_a_id === pair.post_a_id && p.post_b_id === pair.post_b_id))
      );
      loadIssues(profile.district);
    } catch (err) {
      logError("mcd/page.jsx:handleMerge", err);
      alert(err.message || "Failed to merge duplicates.");
    } finally {
      setMergingPairId(null);
    }
  };

  const handleDismissDuplicate = (pair) => {
    setDuplicatePairs((prev) =>
      prev.filter((p) => !(p.post_a_id === pair.post_a_id && p.post_b_id === pair.post_b_id))
    );
  };

  const startCompleting = (id) => {
    setCompletingId(id);
    fileInputRef.current?.click();
  };

  const handleMarkSeen = async (id) => {
    setMarkingSeenId(id);
    try {
      const { error } = await supabase.rpc("mark_seen", { p_post_id: id });
      if (error) throw error;
      setIssues((prev) =>
        prev.map((issue) => (issue.id === id ? { ...issue, seen_by_mcd: true } : issue))
      );
    } catch (err) {
      console.error("Error marking seen:", err);
      alert(err.message || "Failed to mark as seen.");
    } finally {
      setMarkingSeenId(null);
    }
  };

  const handleProofFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const id = completingId;
    e.target.value = "";
    if (!file || !id) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const ext = file.name.split(".").pop();
      const path = `proof/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("issue-photos")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("issue-photos").getPublicUrl(path);

      const { error } = await supabase.rpc("complete_issue", {
        post_id: id,
        proof_url: publicUrl,
      });
      if (error) throw error;

      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === id ? { ...issue, tag: "Completed", proof_url: publicUrl } : issue
        )
      );
    } catch (err) {
      console.error("Error completing issue:", err);
      alert(err.message || "Failed to complete issue.");
    } finally {
      setCompletingId(null);
    }
  };

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

  if (profile === null) {
    return (
      <div className="flex items-center justify-center h-[70vh] bg-cream">
        <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
      </div>
    );
  }

  const pendingCount = issues.filter((i) => i.tag === "Pending").length;
  const completedCount = issues.filter((i) => i.tag === "Completed").length;
  const visibleIssues = issues.filter((i) => tagFilter === "all" || i.tag === tagFilter);

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleProofFileSelected}
      />

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-navy mb-1">MCD Dashboard</h1>
        <p className="text-navy/60 mb-8">Assigned district: {profile.district}</p>

        {duplicatePairs.length > 0 && (
          <div className="mb-10 bg-gold-light/30 border border-gold/40 rounded-xl p-5">
            <p className="font-bold text-navy mb-1">
              Possible Duplicates ({duplicatePairs.length})
            </p>
            <p className="text-sm text-navy/60 mb-4">
              These reports look visually similar but weren't confident enough to auto-merge.
              Confirm if they're the same issue, or dismiss if they're not.
            </p>
            <div className="space-y-3">
              {duplicatePairs.map((pair) => {
                const pairKey = pair.post_a_id + pair.post_b_id;
                return (
                  <div
                    key={pairKey}
                    className="flex flex-col sm:flex-row items-center gap-4 bg-cream-card rounded-lg p-3 border border-navy/10"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <img src={pair.post_a_img} alt={pair.post_a_title} className="w-16 h-16 object-cover rounded-md" />
                      <p className="text-sm text-navy font-medium">{pair.post_a_title}</p>
                    </div>
                    <span className="text-xs text-navy/40 font-semibold shrink-0">
                      {pair.distance}/64 diff
                    </span>
                    <div className="flex items-center gap-2 flex-1">
                      <img src={pair.post_b_img} alt={pair.post_b_title} className="w-16 h-16 object-cover rounded-md" />
                      <p className="text-sm text-navy font-medium">{pair.post_b_title}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleMerge(pair)}
                        disabled={mergingPairId === pairKey}
                        className="px-3 py-1.5 rounded-md bg-navy text-cream text-xs font-semibold hover:bg-navy-light transition disabled:opacity-50"
                      >
                        {mergingPairId === pairKey ? "Merging..." : "Merge"}
                      </button>
                      <button
                        onClick={() => handleDismissDuplicate(pair)}
                        className="px-3 py-1.5 rounded-md border border-navy/20 text-navy/60 text-xs font-semibold hover:bg-navy/5 transition"
                      >
                        Not a duplicate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <div className="bg-cream-card border border-navy/10 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-navy/50">Pending</p>
            <p className="text-3xl font-bold text-gold">{pendingCount}</p>
          </div>
          <div className="bg-cream-card border border-navy/10 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-navy/50">Completed</p>
            <p className="text-3xl font-bold text-navy">{completedCount}</p>
          </div>
          <div className="bg-cream-card border border-navy/10 rounded-xl p-5 shadow-sm col-span-2 md:col-span-1">
            <p className="text-sm text-navy/50">Total Reports</p>
            <p className="text-3xl font-bold text-navy">{issues.length}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
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

        {load ? (
          <div className="flex items-center justify-center h-[40vh]">
            <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
          </div>
        ) : fetchError ? (
          <div className="text-center mt-16">
            <p className="text-navy/70 font-medium mb-3">
              Couldn't load your district's issues — this has been logged.
            </p>
            <button
              onClick={() => {
                setLoad(true);
                loadIssues(profile.district);
              }}
              className="px-5 py-2 rounded-lg bg-navy text-cream font-semibold hover:bg-navy-light transition"
            >
              Retry
            </button>
          </div>
        ) : visibleIssues.length === 0 ? (
          <p className="text-navy/40 text-center mt-16">
            No issues in {profile.district} matching this filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleIssues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-xl shadow-sm bg-cream-card overflow-hidden border-t-4 ${
                  issue.tag === "Pending" ? "border-gold" : "border-navy"
                }`}
              >
                <img
                  src={issue.img_url}
                  alt={issue.title}
                  className="w-full h-[200px] object-cover"
                />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-navy">{issue.title}</h2>
                    {issue.report_count > 1 && (
                      <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                        Reported {issue.report_count}×
                      </span>
                    )}
                    {issue.tag === "Pending" && issue.seen_by_mcd && (
                      <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-navy/10 text-navy">
                        Seen
                      </span>
                    )}
                  </div>
                  <p className="text-navy/60 text-sm mb-4">{issue.description}</p>
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
                    {issue.severity && (
                      <span
                        className={`text-xs px-3 py-1 rounded-full ${
                          issue.severity === "High"
                            ? "bg-red-100 text-red-700"
                            : issue.severity === "Low"
                            ? "bg-navy/5 text-navy/50"
                            : "bg-gold-light/60 text-navy/70"
                        }`}
                      >
                        {issue.severity} severity
                      </span>
                    )}
                  </div>
                  <p className="text-navy/50 text-xs mt-2">
                    Reported by {issue.user_name} · {timeAgo(issue.created_at)}
                  </p>

                  <Link
                    href={`/issues/${issue.id}`}
                    className="inline-block mt-2 text-xs font-semibold text-navy underline"
                  >
                    View Details →
                  </Link>

                  {issue.tag === "Completed" && issue.proof_url && (
                    <div className="mt-4">
                      <p className="text-navy/50 text-xs mb-1">Proof of completion:</p>
                      <img
                        src={issue.proof_url}
                        alt="Completion proof"
                        className="w-full h-[140px] object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {issue.tag === "Pending" && (
                    <div className="mt-4 flex flex-col gap-2">
                      {!issue.seen_by_mcd && (
                        <button
                          onClick={() => handleMarkSeen(issue.id)}
                          disabled={markingSeenId === issue.id}
                          className="w-full py-2 border-2 border-navy text-navy font-semibold rounded-lg hover:bg-navy/5 transition disabled:opacity-50"
                        >
                          {markingSeenId === issue.id ? "Marking..." : "Mark as Seen"}
                        </button>
                      )}
                      <button
                        onClick={() => startCompleting(issue.id)}
                        disabled={completingId === issue.id}
                        className="w-full py-2.5 bg-navy text-cream font-semibold rounded-lg hover:bg-navy-light transition disabled:opacity-50"
                      >
                        {completingId === issue.id
                          ? "Uploading proof..."
                          : "Mark as Completed (upload proof)"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const McdDashboardPageWithBoundary = () => (
  <ErrorBoundary context="mcd/page.jsx">
    <McdDashboardPage />
  </ErrorBoundary>
);

export default McdDashboardPageWithBoundary;
