import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  text,
  jsonb,
  boolean,
  timestamp,
  vector,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Vehicles ────────────────────────────────────────────────────────
export const vehicles = pgTable("vehicles", {
  id: uuid().defaultRandom().primaryKey(),
  make: varchar({ length: 100 }).notNull(),
  model: varchar({ length: 100 }).notNull(),
  variant: varchar({ length: 150 }).notNull(),
  year: integer().notNull(),
  bodyType: varchar("body_type", { length: 50 }).notNull(),
  fuelType: varchar("fuel_type", { length: 50 }).notNull(),
  transmission: varchar({ length: 50 }).notNull(),
  drivetrain: varchar({ length: 20 }).notNull(),
  engineSpec: varchar("engine_spec", { length: 150 }).notNull(),
  horsepower: integer().notNull(),
  torqueLbFt: integer("torque_lb_ft").notNull(),
  fuelEconomy: decimal("fuel_economy", { precision: 5, scale: 1 }).notNull(),
  seating: integer().notNull(),
  safetyRating: varchar("safety_rating", { length: 100 }),
  airbags: integer().notNull(),
  features: jsonb().$type<string[]>().notNull().default([]),
  colors: jsonb().$type<string[]>().notNull().default([]),
  description: text().notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  cargoSpaceL: integer("cargo_space_l"),
  winterReady: boolean("winter_ready").notNull().default(false),
  descriptionEmbedding: vector("description_embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Pricing ─────────────────────────────────────────────────────────
export const pricing = pgTable(
  "pricing",
  {
    id: uuid().defaultRandom().primaryKey(),
    vehicleId: uuid("vehicle_id")
      .references(() => vehicles.id)
      .notNull(),
    msrp: decimal({ precision: 10, scale: 2 }).notNull(),
    dealerCost: decimal("dealer_cost", { precision: 10, scale: 2 }).notNull(),
    marginFloorPct: decimal("margin_floor_pct", { precision: 4, scale: 2 }).notNull(),
    competitorPrice: decimal("competitor_price", { precision: 10, scale: 2 }),
    competitorName: varchar("competitor_name", { length: 150 }),
    inventoryAgeDays: integer("inventory_age_days").notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(1),
    maxDiscountPct: decimal("max_discount_pct", { precision: 4, scale: 2 }).notNull(),
    destinationFee: decimal("destination_fee", { precision: 8, scale: 2 }).notNull(),
    accessoriesCost: decimal("accessories_cost", { precision: 8, scale: 2 }).notNull(),
    accessoriesValue: decimal("accessories_value", { precision: 8, scale: 2 }).notNull(),
    warrantyExtCost: decimal("warranty_ext_cost", { precision: 8, scale: 2 }).notNull(),
    warrantyExtValue: decimal("warranty_ext_value", { precision: 8, scale: 2 }).notNull(),
    financingRatePct: decimal("financing_rate_pct", { precision: 4, scale: 2 }),
    cashbackOffer: decimal("cashback_offer", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("pricing_vehicle_id_idx").on(table.vehicleId)],
);

// ── Conversations ───────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: uuid().defaultRandom().primaryKey(),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  messages: jsonb().$type<Array<{ role: string; content: string; timestamp: number }>>().notNull().default([]),
  buyerProfile: jsonb("buyer_profile").$type<Record<string, unknown>>().notNull().default({}),
  vehiclesViewed: jsonb("vehicles_viewed").$type<string[]>().notNull().default([]),
  currentOffer: jsonb("current_offer"),
  leadScore: varchar("lead_score", { length: 20 }).notNull().default("cold"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Offers ──────────────────────────────────────────────────────────
export const offers = pgTable("offers", {
  id: uuid().defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id)
    .notNull(),
  vehicleId: uuid("vehicle_id")
    .references(() => vehicles.id)
    .notNull(),
  offeredPrice: decimal("offered_price", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  discountPct: decimal("discount_pct", { precision: 4, scale: 2 }).notNull(),
  marginRetainedPct: decimal("margin_retained_pct", { precision: 4, scale: 2 }).notNull(),
  extrasIncluded: jsonb("extras_included").$type<string[]>().notNull().default([]),
  approvalStatus: varchar("approval_status", { length: 30 }).notNull().default("pending"),
  justification: text(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
