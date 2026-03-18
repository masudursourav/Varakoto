"use client";

import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/context/language-context";
import { fetchStopCoords, type StopCoords, type StopItem } from "@/lib/api";
import { MapPin, Plus, Minus } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RoutePreviewProps {
  origin: StopItem;
  destination: StopItem;
}

/**
 * Fetches stop coordinates and manages loading/loaded state.
 * Avoids calling setState synchronously inside useEffect.
 */
function useStopCoords(originEn: string, destEn: string) {
  const [result, setResult] = useState<{
    key: string;
    data: StopCoords | null;
  } | null>(null);

  const currentKey = `${originEn}|${destEn}`;

  useEffect(() => {
    let cancelled = false;
    fetchStopCoords(originEn, destEn).then((data) => {
      if (!cancelled) setResult({ key: currentKey, data });
    });
    return () => {
      cancelled = true;
    };
  }, [originEn, destEn, currentKey]);

  const loading = !result || result.key !== currentKey;
  const coords = loading ? null : result.data;

  return { loading, coords };
}

export function RoutePreview({ origin, destination }: RoutePreviewProps) {
  const { lang } = useLanguage();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const { loading, coords } = useStopCoords(
    origin.name_en,
    destination.name_en,
  );

  // Render map when coordinates are available
  useEffect(() => {
    if (!coords || !mapRef.current) return;

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const { origin: o, destination: d } = coords;
    const bounds = L.latLngBounds([o.lat, o.lng], [d.lat, d.lng]);

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
      boxZoom: false,
      keyboard: false,
    });

    map.fitBounds(bounds.pad(0.4));

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
    }).addTo(map);

    // Origin marker (blue)
    const originIcon = L.divIcon({
      className: "route-preview-marker",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:#1a4a8e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    // Destination marker (red)
    const destIcon = L.divIcon({
      className: "route-preview-marker",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    L.marker([o.lat, o.lng], { icon: originIcon }).addTo(map);
    L.marker([d.lat, d.lng], { icon: destIcon }).addTo(map);

    // Dashed corridor line
    L.polyline(
      [
        [o.lat, o.lng],
        [d.lat, d.lng],
      ],
      {
        color: "#1a4a8e",
        weight: 2,
        dashArray: "6, 8",
        opacity: 0.6,
      },
    ).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [coords]);

  if (loading) {
    return (
      <div className="h-32 animate-pulse rounded-panel bg-slate-100 dark:bg-slate-800" />
    );
  }

  if (!coords) return null;

  const originName = lang === "bn" ? origin.name_bn : origin.name_en;
  const destName = lang === "bn" ? destination.name_bn : destination.name_en;

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  return (
    <div className="overflow-hidden rounded-panel border border-slate-100 dark:border-slate-800">
      <div className="relative">
        <div ref={mapRef} className="h-32 w-full" />
        {/* Zoom controls */}
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
      </div>
      <div className="flex items-center justify-between bg-white px-3 py-2 dark:bg-slate-900">
        <div className="flex items-center gap-1.5 text-xs">
          <MapPin className="h-3 w-3 text-primary" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {originName}
          </span>
        </div>
        <span aria-hidden="true" className="text-xs text-slate-400">→</span>
        <div className="flex items-center gap-1.5 text-xs">
          <MapPin className="h-3 w-3 text-red-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {destName}
          </span>
        </div>
      </div>
    </div>
  );
}
