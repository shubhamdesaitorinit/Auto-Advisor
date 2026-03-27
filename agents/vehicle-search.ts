import { streamText, stepCountIs, type ModelMessage } from "ai";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { getLLM } from "@/lib/llm";
import { VEHICLE_SEARCH_SYSTEM_PROMPT } from "@/prompts/vehicle-search";
import {
  searchVehicles,
  getVehicleDetails,
  compareVehicles,
  getSimilarVehicles,
} from "@/tools/vehicle-db";

function createVehicleSearchTools() {
  const viewedIds = new Set<string>();

  const tools = {
    search_vehicles: tool({
      description:
        "Search for vehicles matching the given criteria. Returns up to 5 results with pricing.",
      inputSchema: z.object({
        budget_max: z.number().optional().describe("Maximum budget in CAD"),
        budget_min: z.number().optional().describe("Minimum budget in CAD"),
        body_type: z.string().optional().describe("Body type: SUV, Sedan, Truck, Hatchback"),
        fuel_type: z.string().optional().describe("Fuel type: Gas, Hybrid, Electric, PHEV"),
        drivetrain: z.string().optional().describe("Drivetrain: AWD, FWD, 4WD"),
        features: z.array(z.string()).optional().describe("Desired features"),
        seating_min: z.number().optional().describe("Minimum number of seats"),
        query: z.string().optional().describe("Natural language search query"),
        winter_ready: z.boolean().optional().describe("Must have AWD + winter features"),
      }),
      execute: async (params) => {
        const results = await searchVehicles({
          budgetMax: params.budget_max,
          budgetMin: params.budget_min,
          bodyType: params.body_type,
          fuelType: params.fuel_type,
          drivetrain: params.drivetrain,
          features: params.features,
          seatingMin: params.seating_min,
          query: params.query,
          winterReady: params.winter_ready,
        });
        // Track viewed vehicle IDs
        for (const r of results) {
          if (r.id) viewedIds.add(r.id);
        }
        return results;
      },
    }),

    get_vehicle_details: tool({
      description: "Get full details and pricing for a specific vehicle by its ID.",
      inputSchema: z.object({
        vehicle_id: z.string().describe("The UUID of the vehicle"),
      }),
      execute: async (params) => {
        const result = await getVehicleDetails(params.vehicle_id);
        if (result?.id) viewedIds.add(result.id);
        return result ?? { error: "Vehicle not found" };
      },
    }),

    compare_vehicles: tool({
      description: "Compare 2-3 vehicles side by side, highlighting key differences.",
      inputSchema: z.object({
        vehicle_ids: z.array(z.string()).min(2).max(3).describe("Array of 2-3 vehicle UUIDs"),
      }),
      execute: async (params) => {
        for (const id of params.vehicle_ids) viewedIds.add(id);
        return compareVehicles(params.vehicle_ids);
      },
    }),

    get_similar_vehicles: tool({
      description: "Find vehicles similar to the given one, using semantic similarity.",
      inputSchema: z.object({
        vehicle_id: z.string().describe("The UUID of the source vehicle"),
        limit: z.number().optional().default(3).describe("Number of similar vehicles"),
      }),
      execute: async (params) => {
        viewedIds.add(params.vehicle_id);
        return getSimilarVehicles(params.vehicle_id, params.limit);
      },
    }),
  };

  return {
    tools,
    getViewedIds: () => [...viewedIds],
  };
}

/**
 * Run the vehicle search agent.
 * Returns a streaming result and a getter for viewed vehicle IDs.
 */
export function runVehicleSearchAgent(
  messages: ModelMessage[],
  onFinish?: (event: { text: string }) => void,
  buyerContext?: string,
) {
  const { tools, getViewedIds } = createVehicleSearchTools();

  const system = buyerContext
    ? `${VEHICLE_SEARCH_SYSTEM_PROMPT}\n\n## Known buyer context\n${buyerContext}`
    : VEHICLE_SEARCH_SYSTEM_PROMPT;

  const stream = streamText({
    model: getLLM(),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(5),
    onFinish,
  });

  return { stream, getViewedIds };
}
