import type { TopicRelevanceResult } from "@/types";

// Keywords that indicate vehicle-related discussion
const VEHICLE_KEYWORDS = [
  // Vehicle types
  "car", "cars", "suv", "sedan", "hatchback", "truck", "vehicle", "auto",
  "coupe", "convertible", "van", "minivan", "crossover", "pickup", "bike",
  "motorcycle", "scooter", "ev", "electric vehicle",
  // Brands
  "hyundai", "kia", "tata", "maruti", "suzuki", "mahindra", "toyota",
  "honda", "ford", "bmw", "audi", "mercedes", "mg", "volkswagen", "skoda",
  "renault", "nissan", "jeep", "citroen", "lexus", "porsche", "jaguar",
  "volvo", "creta", "seltos", "nexon", "brezza", "xuv", "fortuner",
  "city", "verna", "harrier", "hector", "innova", "swift", "baleno",
  "polo", "i20", "venue", "sonet", "punch", "alto", "wagonr", "ertiga",
  // Features & specs
  "mileage", "engine", "torque", "horsepower", "bhp", "cc", "gear",
  "transmission", "automatic", "manual", "diesel", "petrol", "cng",
  "hybrid", "sunroof", "airbag", "abs", "cruise control", "infotainment",
  "boot space", "ground clearance", "wheelbase", "alloy", "tyre", "tire",
  "heated seats", "heated steering", "remote start", "block heater",
  "apple carplay", "android auto", "safety", "rating", "cargo",
  "fuel economy", "fuel efficient", "l/100km", "kwh", "range",
  // Drivetrain
  "awd", "4wd", "fwd", "4x4", "all-wheel", "four-wheel", "drivetrain",
  // Winter / Canadian
  "winter", "snow", "ice", "cold", "canadian", "canada", "winter ready",
  "all-weather", "all-season", "izev", "rebate", "freight", "pdi",
  // Purchase & finance
  "price", "pricing", "budget", "cost", "emi", "loan", "finance",
  "insurance", "on-road", "ex-showroom", "showroom", "dealer",
  "discount", "offer", "deal", "exchange", "trade-in", "resale",
  "down payment", "interest rate", "tenure", "lakh", "lakhs",
  "cad", "dollar", "msrp", "affordable", "cheap", "expensive",
  "cashback", "financing rate", "promotion",
  // Actions
  "test drive", "booking", "book", "compare", "comparison", "review",
  "features", "specs", "specification", "variant", "model", "color",
  "colour", "delivery", "waiting period", "availability",
  "recommend", "suggest", "show me", "looking for", "find", "search",
  "need a", "best", "top", "which",
  // Canadian brands/models not in original list
  "subaru", "mazda", "chevrolet", "chevy", "ram", "tesla",
  "rav4", "cr-v", "crv", "tucson", "sportage", "cx-50", "forester",
  "escape", "highlander", "palisade", "telluride", "f-150", "f150",
  "tacoma", "civic", "camry", "sonata", "model y", "ioniq", "equinox",
  // Registration / Canadian-specific
  "rto", "registration", "road tax", "fastag",
];

// Short messages / conversational responses that should always be allowed
const CONVERSATIONAL_PATTERNS = [
  /^(hi|hello|hey|good\s*(morning|afternoon|evening)|namaste|thanks?|thank\s*you|ok|okay|yes|no|yep|nope|sure|great|cool|got\s*it|alright|bye|goodbye)\b/i,
  /^.{0,15}$/, // Very short messages (likely follow-ups like "yes", "which one?")
];

const OFF_TOPIC_REDIRECT =
  "I specialize in vehicles! Try asking me about SUVs, sedans, or help finding your perfect car.";

export function checkTopicRelevance(message: string): TopicRelevanceResult {
  const lower = message.toLowerCase();

  // Allow conversational / short messages
  for (const pattern of CONVERSATIONAL_PATTERNS) {
    if (pattern.test(message)) {
      return { relevant: true };
    }
  }

  // Check for vehicle-related keywords
  for (const keyword of VEHICLE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { relevant: true };
    }
  }

  // Check for price patterns like "$40,000", "$45K", "under 50k"
  if (/\$[\d,]+|\d+k\b|\d{2,3},?\d{3}/i.test(message)) {
    return { relevant: true };
  }

  return { relevant: false, suggestion: OFF_TOPIC_REDIRECT };
}
