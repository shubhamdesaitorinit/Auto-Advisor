import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../lib/schema";
import { generateEmbedding } from "../lib/embeddings";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle({ client: sql, schema });

async function main() {
  const allVehicles = await db
    .select({
      id: schema.vehicles.id,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      variant: schema.vehicles.variant,
      description: schema.vehicles.description,
      descriptionEmbedding: schema.vehicles.descriptionEmbedding,
    })
    .from(schema.vehicles);

  const needsEmbedding = allVehicles.filter((v) => !v.descriptionEmbedding);
  console.log(
    `Found ${allVehicles.length} vehicles, ${needsEmbedding.length} need embeddings.\n`,
  );

  for (const vehicle of needsEmbedding) {
    try {
      const textForEmbedding = `${vehicle.make} ${vehicle.model} ${vehicle.variant}. ${vehicle.description}`;
      const embedding = await generateEmbedding(textForEmbedding);

      // Use raw SQL because neon-http driver can't pass vector arrays via Drizzle's .set()
      const vectorStr = `[${embedding.join(",")}]`;
      await sql`UPDATE vehicles SET description_embedding = ${vectorStr}::vector WHERE id = ${vehicle.id}`;

      console.log(
        `  ✓ ${vehicle.make} ${vehicle.model} ${vehicle.variant} — ${embedding.length} dimensions`,
      );
    } catch (err) {
      console.error(
        `  ✗ ${vehicle.make} ${vehicle.model} ${vehicle.variant}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log("\nDone generating embeddings.");
}

main().catch((err) => {
  console.error("Embedding generation failed:", err);
  process.exit(1);
});
