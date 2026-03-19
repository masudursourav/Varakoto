const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Vara Koto API",
    description:
      "BRTA-approved bus fare calculator API for Dhaka. Provides stop listings and fare calculations using Google Maps-verified distances.",
    version: "1.0.0",
    contact: {
      email: "ertsourav@gmail.com",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "API v1",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        description: "Returns server health status and uptime.",
        operationId: "healthCheck",
        tags: ["System"],
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    uptime: { type: "number", example: 12345.67 },
                    timestamp: {
                      type: "string",
                      format: "date-time",
                      example: "2026-03-17T09:00:00.000Z",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/stops": {
      get: {
        summary: "List all stops",
        description:
          "Returns a deduplicated list of all bus stops with Bengali and English names, sorted alphabetically by English name.",
        operationId: "getStops",
        tags: ["Stops"],
        responses: {
          "200": {
            description: "List of stops",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Stop" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/fare/calculate": {
      post: {
        summary: "Calculate bus fare",
        description:
          "Calculates BRTA-approved fare between two stops. Returns all matching bus routes with fares, distances, transfer options, and elevated expressway indicators.",
        operationId: "calculateFare",
        tags: ["Fare"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["origin", "destination"],
                properties: {
                  origin: {
                    type: "string",
                    description: "Origin stop name (Bengali or English)",
                    example: "Airport",
                  },
                  destination: {
                    type: "string",
                    description: "Destination stop name (Bengali or English)",
                    example: "Farmgate",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Fare calculation results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/FareResult" },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing origin or destination",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "404": {
            description: "Stop not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/nearest-stop": {
      get: {
        summary: "Find nearest bus stops",
        description:
          "Returns the nearest bus stops to a given GPS coordinate using Haversine distance and optional Barikoi reverse geocoding for area-name matching.",
        operationId: "getNearestStop",
        tags: ["Location"],
        parameters: [
          {
            name: "lat",
            in: "query",
            required: true,
            schema: { type: "number", example: 23.8513 },
            description: "Latitude of the user's position",
          },
          {
            name: "lng",
            in: "query",
            required: true,
            schema: { type: "number", example: 90.4089 },
            description: "Longitude of the user's position",
          },
        ],
        responses: {
          "200": {
            description: "Nearest stops found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    area: {
                      type: "string",
                      nullable: true,
                      example: "Banani",
                      description:
                        "Area name from Barikoi reverse geocoding, or null if unavailable",
                    },
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/NearestStopItem",
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing lat/lng",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/search/places": {
      get: {
        summary: "Search places and map to nearest stop",
        description:
          "Proxies the Barikoi Autocomplete API, then maps each result's coordinates to the nearest known bus stop. Results are limited to the Dhaka metro area.",
        operationId: "searchPlaces",
        tags: ["Location"],
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", example: "জাতীয় সংসদ" },
            description:
              "Search query (min 2 characters, Bengali or English)",
          },
        ],
        responses: {
          "200": {
            description: "Place search results with nearest stops",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/PlaceSearchResult",
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Query too short",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "503": {
            description: "Place search not configured (missing API key)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/stop-coords": {
      get: {
        summary: "Get stop coordinates",
        description:
          "Returns latitude/longitude for origin and destination stops, resolved via alias matching and Barikoi geocoding.",
        operationId: "getStopCoords",
        tags: ["Location"],
        parameters: [
          {
            name: "origin",
            in: "query",
            required: true,
            schema: { type: "string", example: "Airport" },
            description: "Origin stop name (Bengali or English)",
          },
          {
            name: "destination",
            in: "query",
            required: true,
            schema: { type: "string", example: "Farmgate" },
            description: "Destination stop name (Bengali or English)",
          },
        ],
        responses: {
          "200": {
            description:
              "Coordinates for both stops, or null if either could not be resolved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      nullable: true,
                      type: "object",
                      properties: {
                        origin: {
                          $ref: "#/components/schemas/LatLng",
                        },
                        destination: {
                          $ref: "#/components/schemas/LatLng",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing origin or destination",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/route-to-stop": {
      get: {
        summary: "Walking route to nearest stop",
        description:
          "Finds the nearest bus stop to the user's GPS position, then fetches a walking route via the Barikoi Routing API.",
        operationId: "getRouteToStop",
        tags: ["Location"],
        parameters: [
          {
            name: "lat",
            in: "query",
            required: true,
            schema: { type: "number", example: 23.78 },
            description: "Latitude of the user's position",
          },
          {
            name: "lng",
            in: "query",
            required: true,
            schema: { type: "number", example: 90.41 },
            description: "Longitude of the user's position",
          },
        ],
        responses: {
          "200": {
            description:
              "Nearest stop info with optional walking route geometry",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      nullable: true,
                      type: "object",
                      properties: {
                        user: { $ref: "#/components/schemas/LatLng" },
                        stop: {
                          $ref: "#/components/schemas/RouteToStopStop",
                        },
                        route: {
                          nullable: true,
                          type: "object",
                          properties: {
                            geometry: {
                              type: "array",
                              items: {
                                type: "array",
                                items: { type: "number" },
                                minItems: 2,
                                maxItems: 2,
                              },
                              description:
                                "Walking route as [lat, lng] coordinate pairs",
                              example: [
                                [23.78, 90.41],
                                [23.785, 90.412],
                              ],
                            },
                            duration_min: {
                              type: "integer",
                              example: 8,
                              description: "Estimated walking time in minutes",
                            },
                            distance_km: {
                              type: "number",
                              example: 0.6,
                              description: "Walking distance in kilometres",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing lat/lng",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/nearby-stops": {
      get: {
        summary: "List nearby bus stops",
        description:
          "Returns all bus stops within 5 km of the user's GPS position, including coordinates for map rendering. Limited to 15 results, sorted by distance.",
        operationId: "getNearbyStops",
        tags: ["Location"],
        parameters: [
          {
            name: "lat",
            in: "query",
            required: true,
            schema: { type: "number", example: 23.78 },
            description: "Latitude of the user's position",
          },
          {
            name: "lng",
            in: "query",
            required: true,
            schema: { type: "number", example: 90.41 },
            description: "Longitude of the user's position",
          },
        ],
        responses: {
          "200": {
            description: "List of nearby stops with coordinates",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/NearbyStopItem",
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing lat/lng",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/route-map": {
      get: {
        summary: "Route map data",
        description:
          "Returns stop coordinates and driving route geometry for rendering an interactive map. Supports an optional transfer stop for multi-bus routes, producing two route segments.",
        operationId: "getRouteMap",
        tags: ["Location"],
        parameters: [
          {
            name: "origin",
            in: "query",
            required: true,
            schema: { type: "string", example: "Airport" },
            description: "Origin stop name (Bengali or English)",
          },
          {
            name: "destination",
            in: "query",
            required: true,
            schema: { type: "string", example: "Farmgate" },
            description: "Destination stop name (Bengali or English)",
          },
          {
            name: "transfer",
            in: "query",
            required: false,
            schema: { type: "string", example: "Mohakhali" },
            description:
              "Optional transfer stop name for multi-bus routes",
          },
        ],
        responses: {
          "200": {
            description:
              "Route map data with coordinates and geometry, or null if stops could not be resolved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      nullable: true,
                      type: "object",
                      properties: {
                        origin: { $ref: "#/components/schemas/LatLng" },
                        destination: {
                          $ref: "#/components/schemas/LatLng",
                        },
                        transfer: {
                          nullable: true,
                          $ref: "#/components/schemas/LatLng",
                        },
                        segments: {
                          type: "array",
                          items: {
                            $ref: "#/components/schemas/RouteSegment",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing origin or destination",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Stop: {
        type: "object",
        properties: {
          name_en: { type: "string", example: "Farmgate" },
          name_bn: { type: "string", example: "ফার্মগেট" },
        },
      },
      FareResult: {
        type: "object",
        properties: {
          bus: { type: "string", example: "Hanif Enterprise" },
          route_name_en: {
            type: "string",
            example: "Airport - Sadarghat",
          },
          route_name_bn: {
            type: "string",
            example: "বিমানবন্দর - সদরঘাট",
          },
          origin_stop: { type: "string", example: "Airport" },
          destination_stop: { type: "string", example: "Farmgate" },
          distance: { type: "number", example: 15.3 },
          fare: { type: "integer", example: 35 },
          is_transfer: { type: "boolean", example: false },
          may_use_elevated_expressway: { type: "boolean", example: false },
          transfer: {
            $ref: "#/components/schemas/TransferInfo",
            nullable: true,
          },
        },
      },
      TransferInfo: {
        type: "object",
        properties: {
          transfer_stop_en: { type: "string", example: "Mohakhali" },
          transfer_stop_bn: { type: "string", example: "মহাখালী" },
          leg1: { $ref: "#/components/schemas/TransferLeg" },
          leg2: { $ref: "#/components/schemas/TransferLeg" },
        },
      },
      TransferLeg: {
        type: "object",
        properties: {
          bus: { type: "string", example: "Hanif Enterprise" },
          route_name_en: { type: "string", example: "Airport - Mohakhali" },
          route_name_bn: {
            type: "string",
            example: "বিমানবন্দর - মহাখালী",
          },
          origin: { type: "string", example: "Airport" },
          destination: { type: "string", example: "Mohakhali" },
          distance: { type: "number", example: 11.9 },
          fare: { type: "integer", example: 27 },
        },
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Origin stop not found" },
        },
      },
      LatLng: {
        type: "object",
        properties: {
          lat: { type: "number", example: 23.8513 },
          lng: { type: "number", example: 90.4089 },
        },
      },
      NearestStopItem: {
        type: "object",
        properties: {
          name_en: { type: "string", example: "Banani" },
          name_bn: { type: "string", example: "বনানী" },
          distance_km: {
            type: "number",
            nullable: true,
            example: 0.8,
            description:
              "Distance in km from user position, or null for area-name matches",
          },
        },
      },
      PlaceSearchResult: {
        type: "object",
        properties: {
          place_name: {
            type: "string",
            example: "Jatiya Sangsad Bhaban, Sher-e-Bangla Nagar",
            description: "Address or name returned by Barikoi",
          },
          name_en: { type: "string", example: "Farmgate" },
          name_bn: { type: "string", example: "ফার্মগেট" },
          distance_km: {
            type: "number",
            example: 1.2,
            description:
              "Distance from the place to the nearest known bus stop",
          },
        },
      },
      RouteToStopStop: {
        type: "object",
        properties: {
          name_en: { type: "string", example: "Farmgate" },
          name_bn: { type: "string", example: "ফার্মগেট" },
          lat: { type: "number", example: 23.7575 },
          lng: { type: "number", example: 90.3908 },
          distance_km: {
            type: "number",
            example: 0.6,
            description: "Straight-line distance from user to stop",
          },
        },
      },
      NearbyStopItem: {
        type: "object",
        properties: {
          name_en: { type: "string", example: "Banani" },
          name_bn: { type: "string", example: "বনানী" },
          lat: { type: "number", example: 23.7937 },
          lng: { type: "number", example: 90.4066 },
          distance_km: {
            type: "number",
            example: 1.3,
            description: "Distance from user position in km",
          },
        },
      },
      RouteSegment: {
        type: "object",
        properties: {
          geometry: {
            type: "array",
            items: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
            },
            description: "Route polyline as [lng, lat] coordinate pairs",
            example: [
              [90.4089, 23.8513],
              [90.3908, 23.7575],
            ],
          },
        },
      },
    },
  },
};

export default swaggerDocument;
