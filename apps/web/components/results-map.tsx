"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/language-context";
import { t } from "@/lib/i18n";
import { fetchRouteMap, type RouteMapData } from "@/lib/api";
import { Plus, Minus, Loader2 } from "lucide-react";
import { Map as BkoiMap, Marker, LngLatBounds } from "bkoi-gl";

const BARIKOI_KEY = process.env.NEXT_PUBLIC_BARIKOI_API_KEY || "";

interface ResultsMapProps {
  origin: string;
  destination: string;
  /** Transfer stop name (English) for multi-bus results */
  transferStop?: string;
}

export function ResultsMap({
  origin,
  destination,
  transferStop,
}: ResultsMapProps) {
  const { lang } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<typeof BkoiMap> | null>(null);
  const markersRef = useRef<InstanceType<typeof Marker>[]>([]);
  const [data, setData] = useState<RouteMapData | null | undefined>(undefined);

  // Fetch route map data
  useEffect(() => {
    let cancelled = false;
    fetchRouteMap(origin, destination, transferStop).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [origin, destination, transferStop]);

  // Render map when data is available
  useEffect(() => {
    if (data === undefined || data === null || !mapContainerRef.current) return;

    // Clean up previous map
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const { origin: o, destination: d, transfer: tr, segments } = data;

    // Compute bounds
    const bounds = new LngLatBounds([o.lng, o.lat], [d.lng, d.lat]);
    if (tr) bounds.extend([tr.lng, tr.lat]);
    segments.forEach((seg) => {
      seg.geometry.forEach(([lng, lat]) => bounds.extend([lng, lat]));
    });

    const map = new BkoiMap({
      container: mapContainerRef.current,
      accessToken: BARIKOI_KEY,
      bounds: bounds,
      fitBoundsOptions: { padding: 50 },
      attributionControl: false,
    });

    mapRef.current = map;

    // Origin marker (green)
    const originEl = createMarkerEl("#22c55e", "white");
    const originMarker = new Marker({ element: originEl })
      .setLngLat([o.lng, o.lat])
      .addTo(map);
    markersRef.current.push(originMarker);

    // Destination marker (red)
    const destEl = createMarkerEl("#ef4444", "white");
    const destMarker = new Marker({ element: destEl })
      .setLngLat([d.lng, d.lat])
      .addTo(map);
    markersRef.current.push(destMarker);

    // Transfer marker (yellow/amber)
    if (tr) {
      const transferEl = createMarkerEl("#f59e0b", "white");
      const transferMarker = new Marker({ element: transferEl })
        .setLngLat([tr.lng, tr.lat])
        .addTo(map);
      markersRef.current.push(transferMarker);
    }

    // Draw route lines after map loads
    map.on("load", () => {
      if (segments.length === 0) {
        // No route geometry — draw dashed straight line as fallback
        const fallbackCoords: [number, number][] = tr
          ? [
              [o.lng, o.lat],
              [tr.lng, tr.lat],
              [d.lng, d.lat],
            ]
          : [
              [o.lng, o.lat],
              [d.lng, d.lat],
            ];

        map.addSource("route-fallback", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: fallbackCoords },
          },
        });
        map.addLayer({
          id: "route-fallback-line",
          type: "line",
          source: "route-fallback",
          paint: {
            "line-color": "#3b82f6",
            "line-width": 3,
            "line-opacity": 0.6,
            "line-dasharray": [2, 3],
          },
        });
        return;
      }

      // Draw actual route segments
      segments.forEach((seg, i) => {
        const sourceId = `route-segment-${i}`;
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: seg.geometry },
          },
        });
        map.addLayer({
          id: `${sourceId}-line`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": i === 0 ? "#3b82f6" : "#8b5cf6",
            "line-width": 4,
            "line-opacity": 0.8,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [data]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  // Loading state
  if (data === undefined) {
    return (
      <div className="flex h-48 items-center justify-center rounded-panel border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t(lang, "loadingMap")}
        </div>
      </div>
    );
  }

  // No data available
  if (data === null) return null;

  return (
    <div className="overflow-hidden rounded-panel border border-slate-100 dark:border-slate-800">
      <div className="relative">
        <div ref={mapContainerRef} className="h-48 w-full" />

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

      {/* Legend */}
      <div className="flex items-center gap-4 bg-white px-3 py-2 dark:bg-slate-900">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {t(lang, "originStop")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="text-slate-600 dark:text-slate-400">
            {t(lang, "destinationStop")}
          </span>
        </div>
        {data.transfer && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600 dark:text-slate-400">
              {t(lang, "transferStop")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Create a custom marker DOM element with the given colors.
 */
function createMarkerEl(bgColor: string, borderColor: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.backgroundColor = bgColor;
  el.style.border = `2.5px solid ${borderColor}`;
  el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  return el;
}
