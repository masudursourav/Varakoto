"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/language-context";
import type { RouteToStop, StopItem } from "@/lib/api";
import {
  MapPin,
  Navigation,
  Clock,
  X,
  Check,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toBengaliNum } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface NearestStopRouteProps {
  data: RouteToStop;
  onConfirm: (stop: StopItem) => void;
  onDismiss: () => void;
}

function buildMap(
  container: HTMLElement,
  data: RouteToStop,
): L.Map {
  const { user, stop, route } = data;

  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true,
    boxZoom: false,
    keyboard: false,
  });

  const bounds = L.latLngBounds(
    [user.lat, user.lng],
    [stop.lat, stop.lng],
  );
  map.fitBounds(bounds.pad(0.3));

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(map);

  // User location marker (pulsing blue dot)
  const userIcon = L.divIcon({
    className: "nearest-stop-user-marker",
    html: `<div style="position:relative;width:16px;height:16px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.25);animation:pulse 2s infinite"></div>
      <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  // Stop marker (red pin)
  const stopIcon = L.divIcon({
    className: "nearest-stop-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  L.marker([user.lat, user.lng], { icon: userIcon }).addTo(map);
  L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map);

  // Draw route or straight line
  if (route?.geometry && route.geometry.length > 0) {
    L.polyline(route.geometry, {
      color: "#3b82f6",
      weight: 4,
      opacity: 0.8,
    }).addTo(map);
  } else {
    L.polyline(
      [
        [user.lat, user.lng],
        [stop.lat, stop.lng],
      ],
      {
        color: "#3b82f6",
        weight: 3,
        dashArray: "8, 10",
        opacity: 0.6,
      },
    ).addTo(map);
  }

  return map;
}

export function NearestStopRoute({
  data,
  onConfirm,
  onDismiss,
}: NearestStopRouteProps) {
  const { lang } = useLanguage();
  const mapRef = useRef<HTMLDivElement>(null);
  const fullMapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Build inline map
  useEffect(() => {
    if (fullscreen || !mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    mapInstanceRef.current = buildMap(mapRef.current, data);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data, fullscreen]);

  // Build fullscreen map
  useEffect(() => {
    if (!fullscreen || !fullMapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = buildMap(fullMapRef.current, data);
    map.scrollWheelZoom.enable();
    mapInstanceRef.current = map;

    // Lock body scroll
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [data, fullscreen]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  const { stop, route } = data;
  const stopName = lang === "bn" ? stop.name_bn : stop.name_en;

  const distanceText = route?.distance_km
    ? lang === "bn"
      ? `${toBengaliNum(route.distance_km.toString())} কিঃমিঃ`
      : `${route.distance_km} km`
    : lang === "bn"
      ? `~${toBengaliNum(stop.distance_km.toString())} কিঃমিঃ`
      : `~${stop.distance_km} km`;

  const durationText =
    route?.duration_min != null
      ? lang === "bn"
        ? `${toBengaliNum(route.duration_min.toString())} মিনিট`
        : `${route.duration_min} min`
      : null;

  const zoomControls = (
    <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1">
      <button
        onClick={handleZoomIn}
        aria-label="Zoom in"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <Plus className="h-4 w-4 text-slate-700 dark:text-slate-300" />
      </button>
      <button
        onClick={handleZoomOut}
        aria-label="Zoom out"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
      >
        <Minus className="h-4 w-4 text-slate-700 dark:text-slate-300" />
      </button>
    </div>
  );

  const infoBar = (
    <div className="flex items-center justify-between bg-white px-3 py-2.5 dark:bg-slate-900">
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="h-4 w-4 shrink-0 text-red-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {stopName}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-0.5">
              <Navigation className="h-3 w-3" />
              {distanceText}
            </span>
            {durationText && (
              <span className="flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {durationText}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() =>
          onConfirm({ name_en: stop.name_en, name_bn: stop.name_bn })
        }
        className="ml-2 flex shrink-0 items-center gap-1.5 rounded-card bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition active:scale-95"
      >
        <Check className="h-3.5 w-3.5" />
        {lang === "bn" ? "নির্বাচন" : "Select"}
      </button>
    </div>
  );

  // ── Fullscreen overlay ──────────────────────────────────────────────────────
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-slate-950">
        {/* Fullscreen map */}
        <div className="relative flex-1">
          <div ref={fullMapRef} className="h-full w-full" />

          {zoomControls}

          {/* Top-left controls */}
          <div className="absolute left-2 top-2 z-[1000] flex gap-1">
            <button
              onClick={onDismiss}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            </button>
            <button
              onClick={() => setFullscreen(false)}
              aria-label="Exit fullscreen"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Minimize2 className="h-4 w-4 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {/* Bottom info bar */}
        <div className="border-t border-slate-100 dark:border-slate-800">
          {infoBar}
        </div>
      </div>
    );
  }

  // ── Inline view ─────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-panel border border-slate-100 dark:border-slate-800">
      <div className="relative">
        <div ref={mapRef} className="h-44 w-full" />

        {zoomControls}

        {/* Top-left controls */}
        <div className="absolute left-2 top-2 z-[1000] flex gap-1">
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <X className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </button>
          <button
            onClick={() => setFullscreen(true)}
            aria-label="Fullscreen"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Maximize2 className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </button>
        </div>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="map-attribution"
        >
          © OpenStreetMap
        </a>
      </div>

      {infoBar}
    </div>
  );
}
