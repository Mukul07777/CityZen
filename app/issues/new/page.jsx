"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const CATEGORIES = ["Garbage", "Telephone Wires", "Electricity", "Road", "Others"];
const SEVERITIES = ["Low", "Medium", "High"];

const ReportIssuePage = () => {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [severity, setSeverity] = useState("Medium");
  const [district, setDistrict] = useState("");
  const [districts, setDistricts] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [location, setLocation] = useState({ lat: null, lon: null });
  const [locationError, setLocationError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [mergedNote, setMergedNote] = useState("");

  // Must be logged in to report — bounce to /login otherwise.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) router.push("/login");
    });
  }, [router]);

  const [autoDetected, setAutoDetected] = useState(false);

  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Load districts for the dropdown.
  useEffect(() => {
    supabase
      .from("districts")
      .select("name, lat, lon")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("Error loading districts:", error);
          return;
        }
        setDistricts(data);
        if (data.length > 0 && !district) setDistrict(data[0].name);
      });
  }, []);

  // Grab the browser's geolocation once on mount, then auto-pick the
  // nearest district by straight-line distance to each district's
  // center point (districts.lat/lon) — approximate, not a real
  // boundary lookup, but automatic and needs no external API.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLocation({ lat, lon });

        const withCoords = districts.filter((d) => d.lat != null && d.lon != null);
        if (withCoords.length > 0) {
          const nearest = withCoords.reduce((best, d) => {
            const dist = getDistanceKm(lat, lon, d.lat, d.lon);
            return dist < best.dist ? { name: d.name, dist } : best;
          }, { name: withCoords[0].name, dist: Infinity });
          setDistrict(nearest.name);
          setAutoDetected(true);
        }
      },
      (err) => {
        console.error("Geolocation error:", err.message);
        setLocationError("Couldn't get your location. Please allow location access and reload.");
      }
    );
  }, [districts]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setAiNote("");
  };

  const fileToBase64 = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleAnalyzePhoto = async () => {
    if (!file) {
      setError("Attach a photo first, then analyze it.");
      return;
    }
    setAnalyzing(true);
    setAiNote("");
    setError("");
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");

      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.category) setCategory(data.category);
      if (data.severity) setSeverity(data.severity);
      setAiNote("AI suggestions filled in below — review and edit before submitting.");
    } catch (err) {
      console.error("Error analyzing photo:", err);
      setError(err.message || "Couldn't analyze this photo. Fill the form in manually.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) return setError("Title is required.");
    if (!file) return setError("Please attach a photo.");
    if (!district) return setError("Please select a district.");
    if (location.lat === null || location.lon === null) {
      return setError("Location not available yet — allow location access and try again.");
    }

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Upload the photo to Supabase Storage first.
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("issue-photos")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("issue-photos").getPublicUrl(path);

      // Compute a perceptual hash of the photo (free, local, no external
      // API) so submit_report() can catch visual duplicates outside the
      // location+category radius — see supabase/migration_5_photo_dedup.sql.
      // Non-fatal if this fails; dedup just falls back to location-only.
      let photoHash = null;
      try {
        const imageBase64ForHash = await fileToBase64(file);
        const hashRes = await fetch("/api/hash-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: imageBase64ForHash }),
        });
        const hashData = await hashRes.json();
        if (hashRes.ok) photoHash = hashData.hash;
      } catch (hashErr) {
        console.error("Error hashing photo (continuing without it):", hashErr);
      }

      // Resolve a display name: profile row if present, else auth metadata, else email prefix.
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      const userName =
        profile?.username || user.user_metadata?.username || user.email.split("@")[0];

      // submit_report() groups this with an existing nearby Pending report of
      // the same category/district instead of always creating a new row —
      // see supabase/migration_3_scoring_grouping.sql.
      const { data: rpcData, error: rpcError } = await supabase.rpc("submit_report", {
        p_title: title.trim(),
        p_description: description.trim(),
        p_img_url: publicUrl,
        p_lat: location.lat,
        p_lon: location.lon,
        p_issue_category: category,
        p_severity: severity,
        p_district: district,
        p_user_name: userName,
        p_photo_hash: photoHash,
      });
      if (rpcError) throw rpcError;

      const merged = rpcData?.[0]?.merged;
      if (merged) {
        setMergedNote("This looked like an existing report nearby — we added your report to it instead of creating a duplicate.");
        setSubmitting(false);
        setTimeout(() => router.push("/issues"), 1800);
        return;
      }

      router.push("/issues");
    } catch (err) {
      console.error("Error submitting report:", err);
      setError(err.message || "Something went wrong submitting your report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-cream min-h-screen p-6 md:p-10">
      <div className="max-w-xl mx-auto bg-cream-card rounded-2xl shadow-md p-8 border border-navy/10">
        <h1 className="text-3xl font-bold text-navy mb-6">Report an Issue</h1>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-100 text-red-700 text-sm">{error}</div>
        )}
        {locationError && (
          <div className="mb-4 p-3 rounded-md bg-gold-light text-navy text-sm">
            {locationError}
          </div>
        )}
        {mergedNote && (
          <div className="mb-4 p-3 rounded-md bg-gold-light text-navy text-sm">{mergedNote}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-navy mb-1">Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full text-navy/70"
            />
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="mt-3 w-full h-[220px] object-cover rounded-lg"
              />
            )}
            {file && (
              <button
                type="button"
                onClick={handleAnalyzePhoto}
                disabled={analyzing}
                className="mt-3 w-full py-2.5 rounded-lg border-2 border-gold text-navy font-semibold hover:bg-gold-light/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {analyzing ? "Analyzing photo..." : "✨ Analyze with AI (auto-fill fields)"}
              </button>
            )}
            {aiNote && <p className="text-xs text-green-700 mt-2">{aiNote}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Overflowing garbage bin"
              className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any details that would help resolve this faster"
              rows={4}
              className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy placeholder-navy/30 focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy bg-cream-card"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy bg-cream-card"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy mb-1">
              District
              {autoDetected && (
                <span className="ml-2 text-xs font-normal text-green-600">
                  (auto-detected from your location)
                </span>
              )}
            </label>
            <select
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setAutoDetected(false);
              }}
              className="w-full px-4 py-2 border border-navy/20 rounded-lg text-navy bg-cream-card"
            >
              {districts.length === 0 && <option value="">No districts available</option>}
              {districts.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-navy/40">
            {location.lat !== null
              ? `Location captured: ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`
              : "Fetching your location..."}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-navy text-cream py-3 rounded-lg hover:bg-navy-light transition disabled:opacity-50 font-semibold"
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ReportIssuePage;
