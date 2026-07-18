"use client"

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";
import { Messaging } from "react-cssfx-loading";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import ErrorBoundary from "../Components/ErrorBoundary";
import { logError } from "../lib/logError";

// Leaflet touches `window`, so it can't render on the server.
const IssuesMap = dynamic(() => import("../Components/IssuesMap"), { ssr: false });

const IssuesPage = () => {
  const [userId, setId] = useState("");
  const [profile, setProfile] = useState({ role: "citizen", district: null });
  const [data, setData] = useState([]);
  const [load, setLoad] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const pathname = usePathname()
  const router = useRouter()
  const [userLocation, setUserLocation] = useState({ lat: null, long: null });
  const [filter, setFilter] = useState({
    tag: "all",
    madeByYou: false,
    category: "all", // New filter for categories
  });
  const [filteredIssues, setFilteredIssues] = useState([]);
  const [completingId, setCompletingId] = useState(null);
  const [markingSeenId, setMarkingSeenId] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // 'list' | 'map'
  const [myReactions, setMyReactions] = useState({}); // { postId: 'confirm' | 'flag' }
  const [reactingId, setReactingId] = useState(null);
  const fileInputRef = React.useRef(null);

  const loadProfile = async (uid) => {
    const { data: row, error } = await supabase
      .from("profiles")
      .select("role, district")
      .eq("id", uid)
      .single();
    if (!error && row) setProfile(row);
  };

  // Fetch user authentication state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setId(session.user.id);
        loadProfile(session.user.id);
        loadMyReactions(session.user.id);
      } else if (pathname !== "/login" && pathname !== "/signup") {
        router.push("/login");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setId(session.user.id);
        loadProfile(session.user.id);
        loadMyReactions(session.user.id);
      } else {
        setId("");
        setProfile({ role: "citizen", district: null });
        if (pathname !== "/login" && pathname !== "/signup") {
          router.push("/login");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname]);

  // Fetch issues data from Supabase, then keep it live via realtime subscription
  const loadIssues = async () => {
    const { data: rows, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logError("issues/page.jsx:loadIssues", error);
      setFetchError(true);
      setLoad(false);
      return;
    }
    setFetchError(false);

    const transformedData = rows.map((row) => ({
      id: row.id,
      description: row.description,
      src: row.img_url,
      lat: row.lat,
      long: row.lon,
      tag: row.tag,
      madeBy: row.user_id,
      madeByName: row.user_name,
      title: row.title,
      issue: row.issue_category,
      time: new Date(row.created_at).getTime(),
      dist: row.district,
      proof: row.proof_url,
      severity: row.severity,
      reportCount: row.report_count,
      confirmCount: row.confirm_count,
      flagCount: row.flag_count,
      evidenceCount: row.evidence_count,
      seenByMcd: row.seen_by_mcd,
    }));
    setData(transformedData);
    setLoad(false);
  };

  const loadMyReactions = async (uid) => {
    const { data: rows, error } = await supabase
      .from("post_reactions")
      .select("post_id, reaction_type")
      .eq("user_id", uid);
    if (error) return;
    const map = {};
    rows.forEach((r) => (map[r.post_id] = r.reaction_type));
    setMyReactions(map);
  };

  useEffect(() => {
    loadIssues();

    // Live updates: re-fetch whenever posts change (insert/update/delete).
    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        loadIssues();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  // Fetch user location
  useEffect(() => {
    const fetchUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              long: position.coords.longitude,
            });
          },
          (error) => {
            console.error("Error fetching location:", error.message);
          }
        );
      } else {
        console.error("Geolocation is not supported by this browser.");
      }
    };

    fetchUserLocation();
  });

  // Apply filters
  useEffect(() => {
    const applyFilters = () => {
      if (userLocation.lat === null || userLocation.long === null) return;

      const filtered = data.filter((issue) => {
        const distance = getDistance(
          userLocation.lat,
          userLocation.long,
          issue.lat,
          issue.long
        );
        const isWithinRadius = distance <= 5;

        const matchesTag =
          filter.tag === "all" || issue.tag === filter.tag;

        const matchesMadeByYou =
          !filter.madeByYou || issue.madeBy === userId;

        const matchesCategory =
          filter.category === "all" || issue.issue === filter.category;
        return isWithinRadius && matchesTag && matchesMadeByYou && matchesCategory;
      });

      // Prioritize: report_count + confirmations form a combined "community
      // signal" score; higher wins. Ties broken oldest-first so long-pending
      // issues don't get buried.
      filtered.sort((a, b) => {
        const scoreA = a.reportCount + a.confirmCount + (a.evidenceCount || 0) * 2;
        const scoreB = b.reportCount + b.confirmCount + (b.evidenceCount || 0) * 2;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.time - b.time;
      });

      setFilteredIssues(filtered);
    };

    applyFilters();
  }, [filter, data, userLocation, userId]);

  // Confirm ("still an issue") or flag (false report / already fixed /
  // wrong location). Clicking the same reaction again retracts it.
  const handleReact = async (id, type) => {
    setReactingId(id);
    try {
      if (myReactions[id] === type) {
        const { error } = await supabase.rpc("remove_reaction", { p_post_id: id });
        if (error) throw error;
        setMyReactions((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        let reason = null;
        if (type === "flag") {
          reason = window.prompt(
            "Optional: why are you flagging this? (already fixed, wrong location, fake, etc.)"
          );
        }
        const { error } = await supabase.rpc("react_to_post", {
          p_post_id: id,
          p_reaction: type,
          p_reason: reason || null,
        });
        if (error) throw error;
        setMyReactions((prev) => ({ ...prev, [id]: type }));
      }
      // Counts are denormalized server-side by the RPC — re-fetch to reflect them.
      loadIssues();
    } catch (err) {
      console.error("Error reacting to post:", err);
      alert(err.message || "Failed to record your response.");
    } finally {
      setReactingId(null);
    }
  };

  // Clicking "Mark as Completed" opens the file picker for that specific
  // issue; the actual RPC call happens once a proof file is chosen.
  const startCompleting = (id) => {
    setCompletingId(id);
    fileInputRef.current?.click();
  };

  const handleMarkSeen = async (id) => {
    setMarkingSeenId(id);
    try {
      const { error } = await supabase.rpc("mark_seen", { p_post_id: id });
      if (error) throw error;
      setData((prev) =>
        prev.map((issue) =>
          issue.id === id ? { ...issue, seenByMcd: true } : issue
        )
      );
    } catch (err) {
      console.error("Error marking seen:", err);
    } finally {
      setMarkingSeenId(null);
    }
  };

  const handleProofFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const id = completingId;
    e.target.value = ""; // reset so picking the same file twice still fires onChange
    if (!file || !id) return;

    const completedIssue = filteredIssues.find((issue) => issue.id === id);
    if (!completedIssue) {
      console.error("Issue not found.");
      return;
    }

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

      // Ownership/role check + tag update + district score +10 all happen
      // atomically server-side in complete_issue() (see
      // supabase/migration_2_mcd_roles.sql) — only an MCD account assigned
      // to this issue's district can succeed, and proof is required.
      const { error } = await supabase.rpc("complete_issue", {
        post_id: id,
        proof_url: publicUrl,
      });
      if (error) throw error;

      setFilteredIssues((prev) =>
        prev.map((issue) =>
          issue.id === id ? { ...issue, tag: "Completed", proof: publicUrl } : issue
        )
      );
    } catch (err) {
      console.error("Error completing issue:", err);
      alert(err.message || "Failed to complete issue.");
    } finally {
      setCompletingId(null);
    }
  };
  
  
  

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const timeAgo = (milliseconds) => {
    const now = Date.now();
    const timeDiff = now - milliseconds;

    const seconds = Math.floor(timeDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-navy">Issues Around You</h1>
        <Link
          href="/issues/new"
          className="px-5 py-2.5 bg-navy text-cream font-semibold rounded-lg hover:bg-navy-light transition"
        >
          Report an Issue
        </Link>
      </div>

      <div className="flex flex-wrap justify-center gap-4 mb-10 max-w-6xl mx-auto bg-cream-card border border-navy/10 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-navy/70">Tag</label>
          <select
            className="p-2 border border-navy/20 rounded-md text-navy bg-cream-card"
            value={filter.tag}
            onChange={(e) => setFilter({ ...filter, tag: e.target.value })}
          >
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filter.madeByYou}
            onChange={(e) =>
              setFilter({ ...filter, madeByYou: e.target.checked })
            }
            className="h-4 w-4 accent-navy"
          />
          <label className="text-sm font-medium text-navy/70">Made by You</label>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-navy/70">Category</label>
          <select
            className="p-2 border border-navy/20 rounded-md text-navy bg-cream-card"
            value={filter.category}
            onChange={(e) => setFilter({ ...filter, category: e.target.value })}
          >
            <option value="all">All</option>
            <option value="Garbage">Garbage</option>
            <option value="Telephone Wires">Telephone Wires</option>
            <option value="Electricity">Electricity</option>
            <option value="Road">Road</option>
            <option value="Others">Others</option>
          </select>
        </div>

        <div className="inline-flex rounded-lg border border-navy/20 p-1 bg-cream-card w-fit ml-auto">
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

      {/* Hidden file input reused for whichever issue's "Mark as Completed" was clicked */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleProofFileSelected}
      />

      {!load && fetchError && (
        <div className="text-center mt-20">
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
      )}

      {!load && !fetchError && filteredIssues.length === 0 && (
        <p className="text-center text-navy/40 mt-20">
          No issues found within 5km matching your filters.
        </p>
      )}

      {!load && viewMode === "map" && filteredIssues.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <IssuesMap
            issues={filteredIssues}
            center={userLocation.lat ? [userLocation.lat, userLocation.long] : undefined}
          />
        </div>
      )}

      {!load && viewMode === "list" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {filteredIssues.map((issue1) => (
            <div
              key={issue1.id}
              className={`rounded-xl shadow-sm bg-cream-card overflow-hidden border-t-4 ${
                issue1.tag === "Pending" ? "border-gold" : "border-navy"
              }`}
            >
              <img
                src={issue1.src}
                alt={issue1.title}
                className="w-full h-[200px] object-cover"
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-navy">{issue1.title}</h2>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {issue1.reportCount > 1 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                        Reported {issue1.reportCount}×
                      </span>
                    )}
                    {issue1.flagCount >= 2 && issue1.flagCount > issue1.confirmCount && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        Disputed
                      </span>
                    )}
                    {issue1.tag === "Pending" && issue1.seenByMcd && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-navy/10 text-navy">
                        Seen by MCD
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-navy/60 text-sm mb-4">{issue1.description}</p>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full text-cream ${
                      issue1.tag === "Pending" ? "bg-gold" : "bg-navy"
                    }`}
                  >
                    {issue1.tag}
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-navy/5 text-navy/60">
                    {issue1.issue}
                  </span>
                  {issue1.severity && (
                    <span
                      className={`text-xs px-3 py-1 rounded-full ${
                        issue1.severity === "High"
                          ? "bg-red-100 text-red-700"
                          : issue1.severity === "Low"
                          ? "bg-navy/5 text-navy/50"
                          : "bg-gold-light/60 text-navy/70"
                      }`}
                    >
                      {issue1.severity} severity
                    </span>
                  )}
                </div>
                <p className="text-navy/50 text-xs mt-2">
                  Reported by {issue1.madeByName} · {timeAgo(issue1.time)}
                </p>
                {issue1.dist && (
                  <p className="text-navy/50 text-xs">District: {issue1.dist}</p>
                )}

                <Link
                  href={`/issues/${issue1.id}`}
                  className="inline-block mt-2 text-xs font-semibold text-navy underline"
                >
                  View Details →
                </Link>

                {issue1.tag === "Pending" && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => handleReact(issue1.id, "confirm")}
                      disabled={reactingId === issue1.id}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
                        myReactions[issue1.id] === "confirm"
                          ? "bg-navy text-cream border-navy"
                          : "border-navy/20 text-navy/60 hover:bg-navy/5"
                      }`}
                    >
                      👍 Still an issue{issue1.confirmCount > 0 ? ` (${issue1.confirmCount})` : ""}
                    </button>
                    <button
                      onClick={() => handleReact(issue1.id, "flag")}
                      disabled={reactingId === issue1.id}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
                        myReactions[issue1.id] === "flag"
                          ? "bg-red-600 text-white border-red-600"
                          : "border-navy/20 text-navy/60 hover:bg-navy/5"
                      }`}
                    >
                      ⚠️ Flag{issue1.flagCount > 0 ? ` (${issue1.flagCount})` : ""}
                    </button>
                  </div>
                )}

                {issue1.tag === "Completed" && issue1.proof && (
                  <div className="mt-4">
                    <p className="text-navy/50 text-xs mb-1">Proof of completion:</p>
                    <img
                      src={issue1.proof}
                      alt="Completion proof"
                      className="w-full h-[140px] object-cover rounded-lg"
                    />
                  </div>
                )}
                {issue1.tag === "Pending" &&
                  profile.role === "mcd" &&
                  profile.district === issue1.dist && (
                    <div className="mt-4 flex flex-col gap-2">
                      {!issue1.seenByMcd && (
                        <button
                          onClick={() => handleMarkSeen(issue1.id)}
                          disabled={markingSeenId === issue1.id}
                          className="w-full py-2 border-2 border-navy text-navy font-semibold rounded-lg hover:bg-navy/5 transition disabled:opacity-50"
                        >
                          {markingSeenId === issue1.id ? "Marking..." : "Mark as Seen"}
                        </button>
                      )}
                      <button
                        onClick={() => startCompleting(issue1.id)}
                        disabled={completingId === issue1.id}
                        className="w-full py-2.5 bg-navy text-cream font-semibold rounded-lg hover:bg-navy-light transition disabled:opacity-50"
                      >
                        {completingId === issue1.id
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
      {load && (
        <div className="flex items-center justify-center h-[70vh]">
          <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
        </div>
      )}
    </div>
  );
};

const IssuesPageWithBoundary = () => (
  <ErrorBoundary context="issues/page.jsx">
    <IssuesPage />
  </ErrorBoundary>
);

export default IssuesPageWithBoundary;
