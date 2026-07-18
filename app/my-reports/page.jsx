"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { Messaging } from "react-cssfx-loading";

const MyReportsPage = () => {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [load, setLoad] = useState(true);

  useEffect(() => {
    const load1 = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      const { data: rows, error } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (!error) setReports(rows);
      setLoad(false);

      // Clear the "unseen resolution" badge now that they're looking at it.
      await supabase.rpc("mark_my_reports_seen");
    };
    load1();
  }, [router]);

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

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-navy mb-8">My Reports</h1>

        {load ? (
          <div className="flex items-center justify-center h-[40vh]">
            <Messaging color="grey" width="20px" height="20px" duration="0.5s" />
          </div>
        ) : reports.length === 0 ? (
          <p className="text-navy/40 text-center mt-16">
            You haven't reported any issues yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl shadow-sm bg-cream-card overflow-hidden border-t-4 ${
                  r.tag === "Pending" ? "border-gold" : "border-navy"
                }`}
              >
                <img src={r.img_url} alt={r.title} className="w-full h-[180px] object-cover" />
                <div className="p-5">
                  <h2 className="text-lg font-semibold text-navy mb-1">{r.title}</h2>
                  <p className="text-navy/60 text-sm mb-3">{r.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full text-cream ${
                        r.tag === "Pending" ? "bg-gold" : "bg-navy"
                      }`}
                    >
                      {r.tag}
                    </span>
                    <span className="text-xs px-3 py-1 rounded-full bg-navy/5 text-navy/60">
                      {r.issue_category}
                    </span>
                    {r.report_count > 1 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                        Reported {r.report_count}×
                      </span>
                    )}
                    {r.tag === "Pending" && r.seen_by_mcd && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-navy/10 text-navy">
                        Seen by MCD
                      </span>
                    )}
                  </div>
                  <p className="text-navy/50 text-xs">
                    Reported {timeAgo(r.created_at)} · District: {r.district}
                  </p>
                  {r.tag === "Completed" && (
                    <p className="text-green-700 text-xs mt-1 font-medium">
                      Resolved {timeAgo(r.completed_at)}
                    </p>
                  )}
                  <Link
                    href={`/issues/${r.id}`}
                    className="inline-block mt-2 text-xs font-semibold text-navy underline"
                  >
                    View Details →
                  </Link>
                  {r.tag === "Completed" && r.proof_url && (
                    <div className="mt-3">
                      <p className="text-navy/50 text-xs mb-1">Proof of completion:</p>
                      <img
                        src={r.proof_url}
                        alt="Completion proof"
                        className="w-full h-[120px] object-cover rounded-lg"
                      />
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

export default MyReportsPage;
