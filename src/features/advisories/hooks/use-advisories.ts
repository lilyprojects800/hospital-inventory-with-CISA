import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

const IDLE_REFRESH_MS = 60_000;
const SYNCING_REFRESH_MS = 3_000;

export const useAdvisorySummary = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const query = useSuspenseQuery({
    ...trpc.advisories.summary.queryOptions(),
    refetchInterval: (current) =>
      current.state.data?.sync.running ? SYNCING_REFRESH_MS : IDLE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const finishedAt = query.data.sync.lastFinishedAt?.getTime() ?? null;
  const previous = useRef(finishedAt);
  useEffect(() => {
    if (previous.current === finishedAt) return;
    previous.current = finishedAt;
    queryClient.invalidateQueries(trpc.assets.getMany.pathFilter());
    queryClient.invalidateQueries(trpc.advisories.forAsset.pathFilter());
  }, [finishedAt, queryClient, trpc]);

  return query;
};

export const useAssetAdvisories = (assetId: string | null) => {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.advisories.forAsset.queryOptions({ assetId: assetId ?? "" }),
    enabled: Boolean(assetId),
  });
};

export const useSyncAdvisories = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.advisories.sync.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "already_running") {
          toast.info("An advisory sync is already running");
        } else {
          toast.success("Checking CISA for new advisories");
        }
        queryClient.invalidateQueries(trpc.advisories.summary.pathFilter());
      },
      onError: (error) => {
        toast.error(`Failed to start advisory sync: ${error.message}`);
      },
    }),
  );
};
