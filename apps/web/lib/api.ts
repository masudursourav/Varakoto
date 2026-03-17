const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001";

export interface StopItem {
  name_en: string;
  name_bn: string;
}

export interface TransferLeg {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin: string;
  destination: string;
  distance: number;
  fare: number;
}

export interface FareResult {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin_stop: string;
  destination_stop: string;
  distance: number;
  fare: number;
  is_transfer: boolean;
  may_use_elevated_expressway: boolean;
  transfer?: {
    transfer_stop_en: string;
    transfer_stop_bn: string;
    leg1: TransferLeg;
    leg2: TransferLeg;
  };
}

export async function fetchStops(): Promise<StopItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/stops`);
  if (!res.ok) throw new Error("Failed to fetch stops");
  const json = await res.json();
  return json.data;
}

export async function calculateFare(
  origin: string,
  destination: string
): Promise<FareResult[]> {
  const res = await fetch(`${API_BASE}/api/v1/fare/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message || "Failed to calculate fare");
  }
  const json = await res.json();
  return json.data;
}
