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
  descriptionEmbedding: vector("description_embedding", { dimensions: 3072 }),
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

// ── Test Drive Bookings ─────────────────────────────────────────────
export const testDriveBookings = pgTable("test_drive_bookings", {
  id: uuid().defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id).notNull(),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  customerEmail: varchar("customer_email", { length: 200 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }),
  preferredDate: varchar("preferred_date", { length: 20 }).notNull(),
  preferredTime: varchar("preferred_time", { length: 20 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: varchar({ length: 30 }).notNull().default("confirmed"),
  calendarEventId: varchar("calendar_event_id", { length: 300 }),
  location: varchar({ length: 300 }).notNull().default("123 Auto Drive, Toronto, ON M5V 1A1"),
  vehicleInfo: jsonb("vehicle_info").$type<Record<string, string>>().notNull().default({}),
  notes: text(),
  confirmationSent: boolean("confirmation_sent").notNull().default(false),
  reminderSent: boolean("reminder_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Leads ───────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: uuid().defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  customerName: varchar("customer_name", { length: 200 }),
  customerEmail: varchar("customer_email", { length: 200 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  score: varchar({ length: 20 }).notNull().default("cold"),
  scoreDetails: jsonb("score_details").$type<Record<string, unknown>>().notNull().default({}),
  vehiclesInterested: jsonb("vehicles_interested").$type<Array<{ id: string; name: string }>>().notNull().default([]),
  budgetRange: jsonb("budget_range").$type<{ min?: number; max?: number } | null>(),
  buyerProfile: jsonb("buyer_profile").$type<Record<string, unknown>>().notNull().default({}),
  conversationSummary: text("conversation_summary"),
  status: varchar({ length: 30 }).notNull().default("new"),
  assignedTo: varchar("assigned_to", { length: 200 }),
  emailSent: boolean("email_sent").notNull().default(false),
  emailSentAt: timestamp("email_sent_at"),
  source: varchar({ length: 50 }).notNull().default("chat_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
