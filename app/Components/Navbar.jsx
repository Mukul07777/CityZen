"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { FiMenu, FiX } from "react-icons/fi";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const router = useRouter();
  const [currentName, setCurrentName] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [profile, setProfile] = useState({ role: "citizen", district: null });
  const [flag, setFlag] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [unseenResolved, setUnseenResolved] = useState(0);
  const pathname = usePathname();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAccountMenuOpen(false);
    setMenuOpen(false);
    router.push("/login");
  };

  useEffect(() => {
    const applyUser = async (user) => {
      if (user) {
        setFlag(true);
        setCurrentId(user.id);
        setCurrentName(
          user.user_metadata?.full_name ||
            user.user_metadata?.username ||
            user.email.split("@")[0]
        );
        const { data: row } = await supabase
          .from("profiles")
          .select("role, district")
          .eq("id", user.id)
          .single();
        if (row) setProfile(row);

        const { count } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("tag", "Completed")
          .eq("resolved_seen_by_reporter", false);
        setUnseenResolved(count || 0);
      } else {
        setFlag(false);
        setCurrentName("");
        setCurrentId("");
        setProfile({ role: "citizen", district: null });
        setUnseenResolved(0);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applyUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [router, pathname]);

  if (pathname === "/login" || pathname === "/signup") {
    return null;
  }

  const links = [
    { target: "/", label: "Home", active: pathname === "/" },
    { target: "/leaderboard", label: "Leaderboard", active: pathname === "/leaderboard" },
    ...(flag
      ? [{ target: "/issues", label: "Issues", active: pathname === "/issues" }]
      : [{ target: "/browse", label: "Browse Issues", active: pathname === "/browse" }]),
    ...(flag
      ? [{ target: "/my-reports", label: "My Reports", active: pathname === "/my-reports", badge: unseenResolved }]
      : []),
    ...(profile.role === "mcd"
      ? [{ target: "/mcd", label: "MCD Dashboard", active: pathname === "/mcd" }]
      : []),
  ];

  const toggleMenu = () => setMenuOpen(!menuOpen);

  return (
    <div className="flex items-center w-full px-6 md:px-12 py-5 bg-cream border-b border-navy/10 relative">
      {/* Logo */}
      <Link href="/">
        <img
          src="/logo.png"
          alt="CityZen logo"
          className="h-[42px] rounded-lg sm:mr-[10px]"
        />
      </Link>

      {/* Desktop Navbar Links */}
      <div className="hidden sm:flex items-center gap-8 flex-1 ml-12">
        {links.map((link, i) => (
          <Link key={i} href={link.target}>
            <div
              className={`flex items-center gap-1.5 font-semibold text-[15px] md:text-[17px] cursor-pointer transition-colors duration-200 ${
                link.active ? "text-navy" : "text-navy/40 hover:text-navy/70"
              }`}
            >
              {link.label}
              {!!link.badge && (
                <span className="flex items-center justify-center text-[11px] font-bold bg-red-600 text-white rounded-full h-5 w-5">
                  {link.badge}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Mobile Burger Menu */}
      <div className="sm:hidden ml-auto">
        <button onClick={toggleMenu} className="text-[28px] text-navy">
          {menuOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="absolute top-[76px] left-0 w-full bg-cream shadow-lg z-50 flex flex-col items-center p-5 border-b border-navy/10">
          {links.map((link, i) => (
            <Link
              href={link.target}
              key={i}
              className={`flex items-center gap-1.5 font-semibold text-[17px] py-2 px-4 ${
                link.active ? "text-navy" : "text-navy/50"
              }`}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
              {!!link.badge && (
                <span className="flex items-center justify-center text-[11px] font-bold bg-red-600 text-white rounded-full h-5 w-5">
                  {link.badge}
                </span>
              )}
            </Link>
          ))}

          {!flag && (
            <div className="flex flex-col mt-4 gap-2 w-full">
              <Link
                href="/login"
                className="text-center py-2 rounded-lg border border-navy text-navy font-semibold"
              >
                LOG IN
              </Link>
              <Link
                href="/signup"
                className="text-center py-2 rounded-lg bg-navy text-cream font-semibold"
              >
                SIGN UP
              </Link>
            </div>
          )}

          {flag && (
            <div className="flex flex-col items-center mt-4 gap-3 w-full">
              <div className="flex items-center gap-3">
                <span className="flex justify-center items-center bg-navy rounded-full h-[46px] w-[46px] text-cream text-[20px]">
                  {currentName.charAt(0).toUpperCase()}
                </span>
                <div className="flex flex-col leading-tight">
                  <p className="text-[18px] text-navy">{currentName}</p>
                  {profile.role === "mcd" ? (
                    <span className="text-xs font-semibold text-navy bg-gold-light rounded-full px-2 py-0.5 w-fit">
                      MCD · {profile.district || "No district assigned"}
                    </span>
                  ) : (
                    <span className="text-xs text-navy/40">Citizen</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-2 rounded-lg border border-navy text-navy font-semibold"
              >
                LOG OUT
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop Buttons */}
      <div className="hidden sm:flex items-center gap-3 ml-auto">
        {!flag && (
          <>
            <Link
              href="/login"
              className="px-5 py-2 rounded-lg font-semibold text-navy hover:bg-navy/5 transition"
            >
              LOG IN
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2 rounded-lg font-semibold bg-navy text-cream hover:bg-navy-light transition"
            >
              SIGN UP
            </Link>
          </>
        )}
        {flag && <NotificationBell userId={currentId} />}
        {flag && (
          <div className="relative">
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="flex items-center"
            >
              <span className="flex justify-center items-center bg-navy rounded-full h-[46px] w-[46px] text-cream text-[20px] mr-3">
                {currentName.charAt(0).toUpperCase()}
              </span>
              <span className="flex flex-col leading-tight text-left">
                <p className="text-[17px] text-navy">{currentName}</p>
                {profile.role === "mcd" ? (
                  <span className="text-xs font-semibold text-navy bg-gold-light rounded-full px-2 py-0.5 w-fit">
                    MCD · {profile.district || "No district assigned"}
                  </span>
                ) : (
                  <span className="text-xs text-navy/40">Citizen</span>
                )}
              </span>
            </button>

            {accountMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-cream-card rounded-lg shadow-lg border border-navy/10 z-50 overflow-hidden">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 text-sm text-navy hover:bg-navy/5"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
