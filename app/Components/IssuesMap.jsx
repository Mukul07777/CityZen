"use client";

import React from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useRouter } from "next/navigation";
import ErrorBoundary from "./ErrorBoundary";
import "leaflet/dist/leaflet.css";

// Free map: OpenStreetMap tiles via Leaflet — no API key, no billing.
// This component is loaded with next/dynamic (ssr: false) wherever it's
// used, because Leaflet touches `window` and breaks on the server.
const pinColor = (issue) => {
  if (issue.tag === "Completed") return "#0f1f2e"; // navy — resolved
  if (issue.severity === "High") return "#dc2626"; // red — high severity, pending
  return "#c9a24b"; // gold — pending, default
};

const IssuesMapInner = ({ issues, center }) => {
  const router = useRouter();

  const points = issues.filter((i) => i.lat != null && (i.lon != null || i.long != null));

  const mapCenter =
    center ||
    (points.length > 0
      ? [points[0].lat, points[0].lon ?? points[0].long]
      : [28.6139, 77.209]); // fallback: New Delhi, purely a default viewport

  return (
    <div className="rounded-2xl overflow-hidden border border-navy/10 shadow-sm h-[520px]">
      <MapContainer center={mapCenter} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((issue) => (
          <CircleMarker
            key={issue.id}
            center={[issue.lat, issue.lon ?? issue.long]}
            radius={9}
            pathOptions={{ color: pinColor(issue), fillColor: pinColor(issue), fillOpacity: 0.85 }}
            eventHandlers={{ click: () => router.push(`/issues/${issue.id}`) }}
          >
            <Popup>
              <p className="font-semibold">{issue.title}</p>
              <p className="text-xs text-navy/60">{issue.tag} · {issue.dist || issue.district}</p>
              <a href={`/issues/${issue.id}`} className="text-xs underline text-navy">
                View details
              </a>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

// Wrapped in its own ErrorBoundary so a Leaflet init failure only takes
// down the map panel, not the entire Issues/Browse page around it.
const IssuesMap = (props) => (
  <ErrorBoundary context="IssuesMap">
    <IssuesMapInner {...props} />
  </ErrorBoundary>
);

export default IssuesMap;
