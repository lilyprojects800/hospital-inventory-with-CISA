"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { SortableHeader } from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ExposureBadge,
  RemediationBadge,
  SeverityBadge,
} from "@/features/advisories/components/advisory-badges";
import { VersionStatus } from "@/generated/prisma";
import type { AssetListItem } from "../types";
import { VersionStatusBadge } from "./version-status-badge";

const Unknown = () => <span className="text-muted-foreground">Unknown</span>;

const NoValue = () => (
  <span className="text-muted-foreground">
    <span aria-hidden="true">—</span>
    <span className="sr-only">None</span>
  </span>
);

const ExposureCell = ({
  asset,
  onOpen,
}: {
  asset: AssetListItem;
  onOpen: (asset: AssetListItem) => void;
}) => {
  const badge = (
    <button
      type="button"
      className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View advisories for ${asset.product} at ${asset.ip}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(asset);
      }}
    >
      <ExposureBadge
        exposure={asset.exposure}
        count={asset.advisoryCount}
        className="cursor-pointer"
      />
    </button>
  );
  if (asset.advisories.length === 0) return badge;
  const hidden = asset.advisoryCount - asset.advisories.length;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <ul className="flex flex-col gap-1">
            {asset.advisories.map((advisory) => (
              <li key={advisory.advisoryId}>
                <span className="font-mono">{advisory.advisoryId}</span>{" "}
                {advisory.title}
              </li>
            ))}
            {hidden > 0 && <li>and {hidden} more</li>}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const riskColumns = (
  onOpen: (asset: AssetListItem) => void,
): ColumnDef<AssetListItem>[] => [
  {
    accessorKey: "exposure",
    meta: { title: "Advisories" },
    header: ({ column }) => (
      <SortableHeader
        header="Advisories"
        column={column}
        tooltip="Advisory exposure"
      />
    ),
    cell: ({ row }) => <ExposureCell asset={row.original} onOpen={onOpen} />,
  },
  {
    accessorKey: "maxSeverity",
    meta: { title: "Severity" },
    header: ({ column }) => (
      <SortableHeader
        header="Severity"
        column={column}
        tooltip="Highest CVSS score"
      />
    ),
    cell: ({ row }) =>
      row.original.advisoryCount > 0 ? (
        <SeverityBadge score={row.original.maxSeverity} />
      ) : (
        <NoValue />
      ),
  },
  {
    accessorKey: "remediation",
    meta: { title: "Remediation" },
    header: ({ column }) => (
      <SortableHeader
        header="Remediation"
        column={column}
        tooltip="Weakest remediation across matched advisories"
      />
    ),
    cell: ({ row }) =>
      row.original.remediation ? (
        <RemediationBadge level={row.original.remediation} />
      ) : (
        <NoValue />
      ),
  },
];

const inventoryColumns: ColumnDef<AssetListItem>[] = [
  {
    accessorKey: "deviceType",
    meta: { title: "Device Type" },
    header: ({ column }) => (
      <SortableHeader header="Device Type" column={column} />
    ),
    cell: ({ row }) => row.original.deviceType ?? <Unknown />,
  },
  {
    accessorKey: "manufacturer",
    meta: { title: "Manufacturer" },
    header: ({ column }) => (
      <SortableHeader header="Manufacturer" column={column} />
    ),
  },
  {
    accessorKey: "product",
    meta: { title: "Product" },
    header: ({ column }) => <SortableHeader header="Product" column={column} />,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.product}</span>
    ),
  },
  {
    accessorKey: "version",
    meta: { title: "Version" },
    header: ({ column }) => <SortableHeader header="Version" column={column} />,
    cell: ({ row }) => {
      const { version, versionStatus } = row.original;
      if (version) return version;
      return (
        <VersionStatusBadge
          // KNOWN without a version can't be stored, but fall back to Unknown
          status={
            versionStatus === VersionStatus.NOT_APPLICABLE
              ? VersionStatus.NOT_APPLICABLE
              : VersionStatus.UNKNOWN
          }
        />
      );
    },
  },
  {
    accessorKey: "ip",
    meta: { title: "IP Address" },
    header: ({ column }) => (
      <SortableHeader header="IP Address" column={column} />
    ),
    cell: ({ row }) => <span className="font-mono">{row.original.ip}</span>,
  },
  {
    accessorKey: "updatedAt",
    meta: { title: "Last Updated" },
    header: ({ column }) => (
      <SortableHeader header="Last Updated" column={column} />
    ),
    cell: ({ row }) => {
      const updatedAt = row.original.updatedAt;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <time dateTime={updatedAt.toISOString()}>
                {formatDistanceToNow(updatedAt, { addSuffix: true })}
              </time>
            </TooltipTrigger>
            <TooltipContent>{updatedAt.toLocaleString()}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
];

export const getColumns = (
  onOpen: (asset: AssetListItem) => void,
): ColumnDef<AssetListItem>[] => [...riskColumns(onOpen), ...inventoryColumns];
