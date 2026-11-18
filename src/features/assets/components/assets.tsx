"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import {
  EntityContainer,
  EntityHeader,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdvisorySummary } from "@/features/advisories/components/advisory-summary";
import { AssetAdvisoriesSheet } from "@/features/advisories/components/asset-advisories-sheet";
import type { ExposureFilter } from "@/features/advisories/types";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useAssetsParams } from "../hooks/use-asset-params";
import { useSuspenseAssets } from "../hooks/use-assets";
import { EXPOSURE_FILTERS } from "../params";
import { getColumns } from "./columns";
import { CreateAssetDialog } from "./create-asset-dialog";

const EXPOSURE_FILTER_LABELS: Record<ExposureFilter, string> = {
  all: "All devices",
  affected: "Affected",
  possibly: "Possibly affected",
  any: "Affected or possibly",
  unfixed: "No vendor fix",
  none: "No known advisories",
};

export const AssetsSearch = () => {
  const [params, setParams] = useAssetsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search assets"
    />
  );
};

export const ExposureFilterSelect = ({
  value,
  onChange,
}: {
  value: ExposureFilter;
  onChange: (value: ExposureFilter) => void;
}) => (
  <Select value={value} onValueChange={(v) => onChange(v as ExposureFilter)}>
    <SelectTrigger
      className="w-[200px] shrink-0 bg-background"
      aria-label="Filter by advisory exposure"
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {EXPOSURE_FILTERS.map((filter) => (
        <SelectItem key={filter} value={filter}>
          {EXPOSURE_FILTER_LABELS[filter]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const useSelectedAsset = () =>
  useQueryState("asset", parseAsString.withOptions({ history: "push" }));

export const AssetsList = () => {
  const { data: assets, isFetching } = useSuspenseAssets();
  const [params, setParams] = useAssetsParams();
  const [selectedAsset, setSelectedAsset] = useSelectedAsset();

  const setExposure = (exposure: ExposureFilter) =>
    setParams((prev) => ({ ...prev, exposure, page: 1 }));

  const columns = useMemo(
    () => getColumns((asset) => setSelectedAsset(asset.id)),
    [setSelectedAsset],
  );

  return (
    <>
      <AdvisorySummary filter={params.exposure} onFilterChange={setExposure} />
      <DataTable
        paginatedData={assets}
        columns={columns}
        isLoading={isFetching}
        rowOnclick={(row) => setSelectedAsset(row.original.id)}
        search={
          <>
            <AssetsSearch />
            <ExposureFilterSelect
              value={params.exposure}
              onChange={setExposure}
            />
          </>
        }
      />
      <AssetAdvisoriesSheet
        assetId={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />
    </>
  );
};

export const AssetsHeader = () => {
  return (
    <EntityHeader
      title="Assets"
      description="Hospital devices, matched against CISA medical advisories"
      actions={<CreateAssetDialog />}
    />
  );
};

export const AssetsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer header={<AssetsHeader />}>{children}</EntityContainer>
  );
};

export const AssetsLoading = () => {
  return <LoadingView message="Loading assets..." />;
};

export const AssetsError = () => {
  return <ErrorView message="Error loading assets" />;
};
