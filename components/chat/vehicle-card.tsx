"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface VehicleData {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  bodyType: string;
  fuelType: string;
  drivetrain: string;
  engineSpec: string;
  horsepower: number;
  fuelEconomy: string | number;
  seating: number;
  msrp: string | number;
  features: string[];
  winterReady: boolean;
  cargoSpaceL?: number | null;
  stockQuantity?: number;
  financingRatePct?: string | number | null;
  cashbackOffer?: string | number | null;
  safetyRating?: string | null;
}

interface VehicleCardProps {
  vehicle: VehicleData;
  onAskAbout?: (vehicle: VehicleData) => void;
  onCompare?: (vehicle: VehicleData) => void;
  compact?: boolean;
}

function formatPrice(val: string | number): string {
  return `$${Number(val).toLocaleString("en-CA")}`;
}

function formatFeature(feature: string): string {
  return feature
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function VehicleCard({ vehicle, onAskAbout, onCompare, compact }: VehicleCardProps) {
  const isEV = vehicle.fuelType === "Electric";

  return (
    <Card className="overflow-hidden border border-border/40 bg-card hover:border-primary/30 transition-all duration-200 group">
      {/* Header with gradient accent */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {vehicle.year}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {vehicle.bodyType}
              </span>
            </div>
            <h3 className="text-base font-semibold leading-tight truncate">
              {vehicle.make} {vehicle.model}
            </h3>
            <p className="text-sm text-muted-foreground truncate">{vehicle.variant}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-primary">{formatPrice(vehicle.msrp)}</p>
            <p className="text-xs text-muted-foreground">MSRP</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 grid grid-cols-3 gap-1.5">
        <StatBox
          label={isEV ? "Efficiency" : "Fuel"}
          value={isEV ? `${vehicle.fuelEconomy}` : `${vehicle.fuelEconomy}`}
          unit={isEV ? "kWh/100km" : "L/100km"}
        />
        <StatBox label="Power" value={`${vehicle.horsepower}`} unit="hp" />
        <StatBox label="Seats" value={`${vehicle.seating}`} />
      </div>

      {/* Tags */}
      {!compact && (
        <div className="px-4 py-2 flex flex-wrap gap-1">
          <Tag>{vehicle.fuelType}</Tag>
          <Tag>{vehicle.drivetrain}</Tag>
          {vehicle.winterReady && <Tag variant="blue">Winter Ready</Tag>}
          {vehicle.cashbackOffer && Number(vehicle.cashbackOffer) > 0 && (
            <Tag variant="green">{formatPrice(vehicle.cashbackOffer)} back</Tag>
          )}
          {vehicle.financingRatePct && Number(vehicle.financingRatePct) > 0 && (
            <Tag variant="purple">{vehicle.financingRatePct}%</Tag>
          )}
        </div>
      )}

      {/* Features */}
      {!compact && vehicle.features && vehicle.features.length > 0 && (
        <div className="px-4 py-1.5">
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            {vehicle.features.slice(0, 4).map(formatFeature).join(" \u00B7 ")}
            {vehicle.features.length > 4 && ` +${vehicle.features.length - 4}`}
          </p>
        </div>
      )}

      {/* Actions */}
      {(onAskAbout || onCompare) && (
        <div className="px-4 pb-3 pt-1.5 flex gap-2">
          {onAskAbout && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 h-8 text-xs rounded-lg"
              onClick={() => onAskAbout(vehicle)}
            >
              Details
            </Button>
          )}
          {onCompare && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg"
              onClick={() => onCompare(vehicle)}
            >
              Compare
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Stat box component ────────────────────────────────────────────
function StatBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
      <p className="text-xs text-muted-foreground/70">{label}</p>
      <p className="text-sm font-semibold">
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

// ── Tag component ─────────────────────────────────────────────────
function Tag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: "blue" | "green" | "purple";
}) {
  const colors = {
    blue: "bg-sky-500/10 text-sky-400",
    green: "bg-emerald-500/10 text-emerald-400",
    purple: "bg-violet-500/10 text-violet-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        variant ? colors[variant] : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

// ── Grid for multiple vehicles ────────────────────────────────────
interface VehicleCardGridProps {
  vehicles: VehicleData[];
  onAskAbout?: (vehicle: VehicleData) => void;
  onCompare?: (vehicle: VehicleData) => void;
}

export function VehicleCardGrid({ vehicles, onAskAbout, onCompare }: VehicleCardGridProps) {
  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-2">
      {vehicles.map((v) => (
        <VehicleCard
          key={v.id}
          vehicle={v}
          onAskAbout={onAskAbout}
          onCompare={onCompare}
        />
      ))}
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────
interface ComparisonTableProps {
  vehicles: VehicleData[];
  differences: string[];
}

export function ComparisonTable({ vehicles, differences }: ComparisonTableProps) {
  if (!vehicles || vehicles.length < 2) return null;

  const rows: { label: string; values: string[] }[] = [
    { label: "Price", values: vehicles.map((v) => formatPrice(v.msrp)) },
    {
      label: "Fuel",
      values: vehicles.map((v) =>
        v.fuelType === "Electric"
          ? `${v.fuelEconomy} kWh/100km`
          : `${v.fuelEconomy} L/100km`,
      ),
    },
    { label: "Power", values: vehicles.map((v) => `${v.horsepower} hp`) },
    { label: "Drive", values: vehicles.map((v) => v.drivetrain) },
    { label: "Seats", values: vehicles.map((v) => String(v.seating)) },
    {
      label: "Cargo",
      values: vehicles.map((v) => (v.cargoSpaceL ? `${v.cargoSpaceL}L` : "\u2014")),
    },
    {
      label: "Winter",
      values: vehicles.map((v) => (v.winterReady ? "Yes" : "No")),
    },
  ];

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/40 bg-card">
      {/* Vehicle headers */}
      <div className="grid border-b border-border/40 bg-muted/30" style={{ gridTemplateColumns: `100px repeat(${vehicles.length}, 1fr)` }}>
        <div className="px-3 py-2.5" />
        {vehicles.map((v) => (
          <div key={v.id} className="px-3 py-2.5 border-l border-border/40">
            <p className="text-sm font-semibold">{v.make} {v.model}</p>
            <p className="text-xs text-muted-foreground">{formatPrice(v.msrp)}</p>
          </div>
        ))}
      </div>

      {/* Comparison rows */}
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid border-b border-border/20 last:border-0"
          style={{ gridTemplateColumns: `100px repeat(${vehicles.length}, 1fr)` }}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground font-medium">
            {row.label}
          </div>
          {row.values.map((val, vi) => (
            <div key={vi} className="px-3 py-2 text-sm border-l border-border/20">
              {val}
            </div>
          ))}
        </div>
      ))}

      {/* Differences */}
      {differences.length > 0 && (
        <div className="px-3 py-2.5 bg-muted/20 border-t border-border/40">
          <p className="text-xs font-medium text-muted-foreground mb-1">Key differences</p>
          <div className="flex flex-wrap gap-1.5">
            {differences.map((d, i) => (
              <span key={i} className="text-xs bg-muted rounded-md px-2 py-0.5 text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
