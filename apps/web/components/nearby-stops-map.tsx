"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/language-context";
import {
  fetchNearbyStops,
  type NearbyStop,
  type StopItem,
} from "@/lib/api";
import { toBengaliNum } from "@/lib/utils";
import {
  MapPin,
  Navigation,
  X,
  Plus,
  Minus,
  Loader2,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface NearbyStopsMapProps {
  userLat: number;
  userLng: number;
  onSelect: (stop: StopItem) => void;
  onDismiss: () => void;
}

function buildNearbyMap(
  container: HTMLElement,
  userLat: number,
  userLng: number,
  stops: NearbyStop[],
  lang: "bn" | "en",
  onSelect: (stop: StopItem) => void,
): L.Map {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
    boxZoom: false,
    keyboard: false,
  });

  // Fit bounds to include user + all stops
  const points: L.LatLngExpression[] = [
    [userLat, userLng],
    ...stops.map((s) => [s.lat, s.lng] as L.LatLngExpression),
  ];
  const bounds = L.latLngBounds(points);
  map.fitBounds(bounds.pad(0.15));

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(map);

  // User location marker (pulsing blue dot)
  const userIcon = L.divIcon({
    className: "nearby-user-marker",
    html: `<div style="position:relative;width:18px;height:18px">
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.25);animation:pulse 2s infinite"></div>
      <div style="position:absolute;inset:3px;border-radius:50%;background:#3b82f6;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  L.marker([userLat, userLng], { icon: userIcon })
    .bindTooltip(lang === "bn" ? "আপনি এখানে" : "You are here", {
      direction: "top",
      offset: [0, -10],
      className: "nearby-tooltip",
    })
    .addTo(map);

  // Stop markers
  for (const stop of stops) {
    const stopIcon = L.divIcon({
      className: "nearby-stop-marker",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:white;border:2px solid #ef4444;box-shadow:0 2px 6px rgba(0,0,0,0.2)">
        <div style="width:10px;height:10px;border-radius:50%;background:#ef4444"></div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const name = lang === "bn" ? stop.name_bn : stop.name_en;
    const dist =
      lang === "bn"
        ? `${toBengaliNum(stop.distance_km.toString())} কিঃমিঃ`
        : `${stop.distance_km} km`;

    const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon })
      .bindTooltip(name, {
        direction: "top",
        offset: [0, -16],
        className: "nearby-tooltip",
      })
      .addTo(map);

    // Popup with select button
    marker.bindPopup(
      `<div style="text-align:center;min-width:120px">
        <div style="font-weight:600;font-size:13px;margin-bottom:2px">${name}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:6px">${dist}</div>
        <button class="nearby-select-btn" data-en="${stop.name_en}" data-bn="${stop.name_bn}" style="
          background:#1a4a8e;color:white;border:none;border-radius:8px;
          padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;
          width:100%;
        ">${lang === "bn" ? "নির্বাচন করুন" : "Select Stop"}</button>
      </div>`,
      { closeButton: false, className: "nearby-popup" },
    );

    marker.on("popupopen", () => {
      // Attach click handler to the select button inside popup
      setTimeout(() => {
        const btn = document.querySelector(
          `.nearby-select-btn[data-en="${stop.name_en}"]`,
        ) as HTMLButtonElement | null;
        btn?.addEventListener("click", () => {
          onSelect({ name_en: stop.name_en, name_bn: stop.name_bn });
        });
      }, 0);
    });
  }

  return map;
}

export function NearbyStopsMap({
  userLat,
  userLng,
  onSelect,
  onDismiss,
}: NearbyStopsMapProps) {
  const { lang } = useLanguage();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [stops, setStops] = useState<NearbyStop[] | null>(null);

  // Fetch nearby stops
  useEffect(() => {
    let cancelled = false;
    fetchNearbyStops(userLat, userLng).then((data) => {
      if (!cancelled) setStops(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userLat, userLng]);

  // Render map
  useEffect(() => {
    if (!stops || !mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    mapInstanceRef.current = buildNearbyMap(
      mapRef.current,
      userLat,
      userLng,
      stops,
      lang,
      (stop) => {
        onSelect(stop);
      },
    );

    // Lock body scroll
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [stops, lang, userLat, userLng, onSelect]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  // Loading state
  if (!stops) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {lang === "bn" ? "কাছের স্টপ খুঁজছে..." : "Finding nearby stops..."}
        </p>
      </div>
    );
  }

  // No stops found
  if (stops.length === 0) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-slate-950">
        <MapPin className="h-8 w-8 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
          {lang === "bn"
            ? "কাছে কোনো বাস স্টপ পাওয়া যায়নি"
            : "No bus stops found nearby"}
        </p>
        <button
          onClick={onDismiss}
          className="mt-4 rounded-card border border-slate-200 px-4 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
        >
          {lang === "bn" ? "ফিরে যান" : "Go back"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {lang === "bn"
              ? `কাছের ${toBengaliNum(stops.length.toString())}টি বাস স্টপ`
              : `${stops.length} Nearby Bus Stops`}
          </span>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="rounded-full p-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapRef} className="h-full w-full" />

        {/* Zoom controls */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1">
          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Plus className="h-4 w-4 text-slate-700 dark:text-slate-300" />
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-md transition-colors hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <Minus className="h-4 w-4 text-slate-700 dark:text-slate-300" />
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

      {/* Bottom stop list */}
      <div className="max-h-40 overflow-y-auto border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        {stops.map((stop) => {
          const name = lang === "bn" ? stop.name_bn : stop.name_en;
          const dist =
            lang === "bn"
              ? `${toBengaliNum(stop.distance_km.toString())} কিঃমিঃ`
              : `${stop.distance_km} km`;

          return (
            <button
              key={stop.name_en}
              onClick={() =>
                onSelect({ name_en: stop.name_en, name_bn: stop.name_bn })
              }
              className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 dark:active:bg-slate-700"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
                <MapPin className="h-4 w-4 text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {name}
                </p>
                {lang === "bn" && (
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {stop.name_en}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {dist}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
