import { advisoriesRouter } from "@/features/advisories/server/routers";
import { assetsRouter } from "@/features/assets/server/routers";
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({
  assets: assetsRouter,
  advisories: advisoriesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
