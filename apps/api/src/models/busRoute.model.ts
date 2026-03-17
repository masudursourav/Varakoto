import mongoose, { Schema, type Document } from "mongoose";

export interface Stop {
  name_en: string;
  name_bn: string;
  km: number;
}

export interface IBusRoute extends Document {
  route_id: string;
  route_name_en: string;
  route_name_bn: string;
  rate_per_km: number;
  min_fare: number;
  buses: string[];
  stops: Stop[];
}

const stopSchema = new Schema<Stop>(
  {
    name_en: { type: String, required: true },
    name_bn: { type: String, required: true },
    km: { type: Number, required: true },
  },
  { _id: false }
);

const busRouteSchema = new Schema<IBusRoute>(
  {
    route_id: { type: String, required: true },
    route_name_en: { type: String, required: true },
    route_name_bn: { type: String, required: true },
    rate_per_km: { type: Number, required: true },
    min_fare: { type: Number, required: true },
    buses: { type: [String], default: [] },
    stops: { type: [stopSchema], default: [] },
  },
  { collection: "bus_route" }
);

export const BusRoute = mongoose.model<IBusRoute>("BusRoute", busRouteSchema);
