"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

// Reads public.notifications (migration 10) — real rows created by a
// server-side trigger (notify_post_reporter()) when a report is seen or
// resolved, rather than the client inferring "unseen" from post columns.
const NotificationBell = ({ userId }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const loadNotifications = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("id, post_id, type, message, read, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setNotifications(data);
  };

  useEffect(() => {
    loadNotifications();
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => loadNotifications()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  if (!userId) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClick = async (n) => {
    if (!n.read) {
      await supabase.rpc("mark_notification_read", { p_id: n.id });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
    if (n.post_id) router.push(`/issues/${n.post_id}`);
  };

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 36e5);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-navy/5 transition"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full h-4 w-4">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-cream-card rounded-lg shadow-lg border border-navy/10 z-50">
          {notifications.length === 0 ? (
            <p className="text-sm text-navy/40 text-center py-6">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-navy/5 hover:bg-navy/5 transition ${
                  n.read ? "text-navy/50" : "text-navy font-medium bg-gold-light/20"
                }`}
              >
                <p>{n.message}</p>
                <p className="text-xs text-navy/40 mt-1">{timeAgo(n.created_at)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
