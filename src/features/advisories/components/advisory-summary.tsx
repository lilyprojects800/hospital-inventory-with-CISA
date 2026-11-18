"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangleIcon,
  FileWarningIcon,
  Loader2Icon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldQuestionIcon,
  ShieldXIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdvisorySummary, useSyncAdvisories } from "../hooks/use-advisories";
import type { ExposureFilter } from "../types";

type StatCardProps = {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
  active: boolean;
  onSelect: () => void;
};

const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  className,
  active,
  onSelect,
}: StatCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    className={cn(
      "flex flex-col gap-1 rounded-lg border bg-background p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "ring-2 ring-ring",
    )}
  >
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className={cn("size-4", className)} aria-hidden="true" />
      {label}
    </span>
    <span
      className={cn(
        "text-2xl font-semibold tabular-nums",
        value > 0 ? className : "text-foreground",
      )}
    >
      {value}
    </span>
    <span className="text-xs text-muted-foreground">{hint}</span>
  </button>
);

const SyncStatus = () => {
  const { data } = useAdvisorySummary();
  const sync = useSyncAdvisories();
  const { running, lastSuccessAt, lastError } = data.sync;
  const busy = running || sync.isPending;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-4">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <FileWarningIcon className="size-4" aria-hidden="true" />
        CISA advisories
      </span>
      <span className="text-2xl font-semibold tabular-nums">
        {data.advisoriesMatched}
        <span className="text-sm font-normal text-muted-foreground">
          {" "}
          of {data.advisoriesTracked} match
        </span>
      </span>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs",
            lastError ? "text-destructive" : "text-muted-foreground",
          )}
          title={lastError ?? undefined}
        >
          {running
            ? "Syncing…"
            : lastError
              ? "Last sync had errors"
              : lastSuccessAt
                ? `Synced ${formatDistanceToNow(lastSuccessAt, { addSuffix: true })}`
                : "Never synced"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy}
          onClick={() => sync.mutate()}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCwIcon aria-hidden="true" />
          )}
          Sync now
        </Button>
      </div>
    </div>
  );
};

export const AdvisorySummary = ({
  filter,
  onFilterChange,
}: {
  filter: ExposureFilter;
  onFilterChange: (filter: ExposureFilter) => void;
}) => {
  const { data } = useAdvisorySummary();
  const toggle = (next: ExposureFilter) =>
    onFilterChange(filter === next ? "all" : next);

  return (
    <div className="flex flex-col gap-3">
      {data.advisoriesTracked === 0 && !data.sync.running && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
          No advisory data yet. Run a sync to pull CISA medical advisories and
          match them to your inventory.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Affected devices"
          value={data.affectedAssets}
          hint="Product and version match an advisory"
          icon={ShieldAlertIcon}
          className="text-red-600 dark:text-red-400"
          active={filter === "affected"}
          onSelect={() => toggle("affected")}
        />
        <StatCard
          label="Possibly affected"
          value={data.possiblyAffectedAssets}
          hint="Confirm the device's version or model"
          icon={ShieldQuestionIcon}
          className="text-amber-600 dark:text-amber-400"
          active={filter === "possibly"}
          onSelect={() => toggle("possibly")}
        />
        <StatCard
          label="No vendor fix"
          value={data.unfixedAssets}
          hint="Exposed devices relying on mitigations"
          icon={ShieldXIcon}
          className="text-red-600 dark:text-red-400"
          active={filter === "unfixed"}
          onSelect={() => toggle("unfixed")}
        />
        <SyncStatus />
      </div>
    </div>
  );
};
