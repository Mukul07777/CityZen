"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { Messaging } from "react-cssfx-loading";
import ProgressTracker from "../../Components/ProgressTracker";
import ErrorBoundary from "../../Components/ErrorBoundary";
import { logError } from "../../lib/logError";

const IssueDetailPage = () => {
  const { id } = useParams();
  const router = useRouter();

  const [issue, setIssue] = useState(null);
  const [load, setLoad] = useState(true);
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState({ role: "citizen", district: null });
  const [myReaction, setMyReaction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const proofInputRef = useRef(null);
  const evidenceInputRef = useRef(null);

  const loadIssue = async () => {
    const { data, error } = await supabase.from("posts").select("*").eq("id", id).single();
    if (error) {
      logError("issues/[id]/page.jsx:loadIssue", error);
      setLoad(false);
      return;
    }
    setIssue(data);
    setLoad(false);
  };

  useEffect(() => {
    loadIssue();

    const channel = supabase
      .channel(`post-${id}-changes`)
      .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `id=eq.${id}` }, loadIssue)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      setUserId(session.user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("role, district")
        .eq("id", session.user.id)
        .single();
      if (prof) setProfile(prof);

      const { data: reaction } = await supabase
        .from("post_reactions")
        .select("reaction_type")
        .eq("post_id", id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (reaction) setMyReaction(reaction.reaction_type);
    });
  }, [id]);

  const handleReact = async (type, photoFile) => {
    setBusy(true);
    setError("");
    try {
      let photoUrl = null;
      if (photoFile) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const ext = photoFile.name.split(".").pop();
        const path = `evidence/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("issue-photos")
          .upload(path, photoFile);
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("issue-photos").getPublicUrl(path);
        photoUrl = publicUrl;
      }

      let reason = null;
      if (type === "flag") {
        reason = window.prompt("Optional: why are you flagging this?");
      }

      const { error: rpcError } = await supabase.rpc("react_to_post", {
        p_post_id: id,
        p_reaction: type,
        p_reason: reason || null,
        p_photo_url: photoUrl,
      });
      if (rpcError) throw rpcError;

      setMyReaction(type);
      loadIssue();
    } catch (err) {
      console.error("Error reacting:", err);
      setError(err.message || "Failed to record your response.");
    } finally {
      setBusy(false);
    }
  };

  const handleEvidenceFileSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    handleReact("confirm", file);
  };

  const handleMarkSeen = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.rpc("mark_seen", { p_post_id: id });
      if (error) throw error;
      loadIssue();
    } catch (err) {
      console.error("Error marking seen:", err);
      setError(err.message || "Failed to mark as seen.");
    } finally {
      setBusy(false);
    }
  };

  const handleProofFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop();
      const path = `proof/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("issue-photos")
        .upload(path, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("issue-photos").getPublicUrl(path);

      const { error: rpcError } = await supabase.rpc("complete_issue", {
        post_id: id,
        proof_url: publicUrl,
      });
      if (rpcError) throw rpcError;
      loadIssue();
    } catch (err) {
      console.error("Error completing issue:", err);
      setError(err.message || "Failed to complete issue.");
    } finally {
      setBusy(false);
    }
  };

  if (load) {
    return (
      <div className="flex items-center justify-center h-[70vh] bg-cream">
        <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center p-6">
        <p className="text-navy/50">Issue not found, or you don't have access to view it.</p>
      </div>
    );
  }

  const isMcdForThisDistrict = profile.role === "mcd" && profile.district === issue.district;
  const mapUrl = `https://www.google.com/maps?q=${issue.lat},${issue.lon}`;

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/issues" className="text-sm text-navy/50 hover:text-navy mb-4 inline-block">
          ← Back to Issues
        </Link>

        <div className="bg-cream-card rounded-2xl shadow-md border border-navy/10 overflow-hidden">
          <img src={issue.img_url} alt={issue.title} className="w-full h-[320px] object-cover" />

          <div className="p-8">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">{error}</div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-navy">{issue.title}</h1>
                <p className="text-navy/50 text-sm mt-1">
                  {issue.district} · Reported by {issue.user_name} on{" "}
                  {new Date(issue.created_at).toLocaleDateString()}
                </p>
              </div>
              {issue.report_count > 1 && (
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-100 text-red-700">
                  Reported {issue.report_count}×
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
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
              {issue.flag_count >= 2 && issue.flag_count > issue.confirm_count && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">
                  Disputed
                </span>
              )}
            </div>

            <p className="text-navy/70 mb-6">{issue.description}</p>

            {/* Progress tracker */}
            <div className="mb-8 p-5 bg-navy/[0.03] rounded-xl">
              <ProgressTracker
                seen={issue.seen_by_mcd}
                resolved={issue.tag === "Completed"}
                createdAt={issue.created_at}
                seenAt={issue.seen_at}
                resolvedAt={issue.completed_at}
              />
            </div>

            {/* Location */}
            <div className="mb-6">
              <p className="text-sm font-medium text-navy mb-1">Location</p>
              <p className="text-navy/60 text-sm mb-2">
                {issue.lat?.toFixed(5)}, {issue.lon?.toFixed(5)}
              </p>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm font-semibold text-navy underline"
              >
                Open in Google Maps ↗
              </a>
            </div>

            {/* Community confirmation counts */}
            <div className="mb-6 flex gap-6 text-sm text-navy/60">
              <span>👍 {issue.confirm_count || 0} confirmed still an issue</span>
              <span>📷 {issue.evidence_count || 0} with photo evidence</span>
              <span>⚠️ {issue.flag_count || 0} flagged</span>
            </div>

            {/* Proof of completion */}
            {issue.tag === "Completed" && issue.proof_url && (
              <div className="mb-6">
                <p className="text-sm font-medium text-navy mb-2">Proof of completion</p>
                <img
                  src={issue.proof_url}
                  alt="Completion proof"
                  className="w-full h-[220px] object-cover rounded-lg"
                />
              </div>
            )}

            {/* Citizen actions */}
            {userId && issue.tag === "Pending" && !isMcdForThisDistrict && (
              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={() => handleReact("confirm")}
                  disabled={busy}
                  className={`text-sm font-semibold px-4 py-2 rounded-full border transition disabled:opacity-50 ${
                    myReaction === "confirm"
                      ? "bg-navy text-cream border-navy"
                      : "border-navy/20 text-navy/60 hover:bg-navy/5"
                  }`}
                >
                  👍 Still an issue
                </button>
                <button
                  onClick={() => evidenceInputRef.current?.click()}
                  disabled={busy}
                  className="text-sm font-semibold px-4 py-2 rounded-full border-2 border-gold text-navy hover:bg-gold-light/30 transition disabled:opacity-50"
                >
                  📷 Still not fixed — add photo evidence
                </button>
                <button
                  onClick={() => handleReact("flag")}
                  disabled={busy}
                  className={`text-sm font-semibold px-4 py-2 rounded-full border transition disabled:opacity-50 ${
                    myReaction === "flag"
                      ? "bg-red-600 text-white border-red-600"
                      : "border-navy/20 text-navy/60 hover:bg-navy/5"
                  }`}
                >
                  ⚠️ Flag
                </button>
                <input
                  ref={evidenceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEvidenceFileSelected}
                />
              </div>
            )}

            {!userId && issue.tag === "Pending" && (
              <p className="text-sm text-navy/50 mb-6">
                <Link href="/login" className="underline font-semibold text-navy">
                  Log in
                </Link>{" "}
                to confirm, flag, or add evidence for this issue.
              </p>
            )}

            {/* MCD actions */}
            {isMcdForThisDistrict && issue.tag === "Pending" && (
              <div className="flex flex-wrap gap-3">
                {!issue.seen_by_mcd && (
                  <button
                    onClick={handleMarkSeen}
                    disabled={busy}
                    className="text-sm font-semibold px-5 py-2.5 rounded-lg border-2 border-navy text-navy hover:bg-navy/5 transition disabled:opacity-50"
                  >
                    Mark as Seen
                  </button>
                )}
                <button
                  onClick={() => proofInputRef.current?.click()}
                  disabled={busy}
                  className="text-sm font-semibold px-5 py-2.5 rounded-lg bg-navy text-cream hover:bg-navy-light transition disabled:opacity-50"
                >
                  {busy ? "Working..." : "Mark as Completed (upload proof)"}
                </button>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleProofFileSelected}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const IssueDetailPageWithBoundary = () => (
  <ErrorBoundary context="issues/[id]/page.jsx">
    <IssueDetailPage />
  </ErrorBoundary>
);

export default IssueDetailPageWithBoundary;
