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
    },
  },
};

export default swaggerDocument;
