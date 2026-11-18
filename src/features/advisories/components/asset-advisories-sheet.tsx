"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  InfoIcon,
  Loader2Icon,
} from "lucide-react";
import { ErrorView } from "@/components/entity-components";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAssetAdvisories } from "../hooks/use-advisories";
import type {
  AssetAdvisoriesResponse,
  AssetAdvisoryMatchResponse,
  RemediationResponse,
} from "../types";
import {
  ExposureBadge,
  exposureMeta,
  RemediationCategoryBadge,
  SeverityBadge,
} from "./advisory-badges";

const ExternalLink = ({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={cn(
      "inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline",
      className,
    )}
  >
    {children}
    <ExternalLinkIcon className="size-3" aria-hidden="true" />
  </a>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </h4>
);

const Remediations = ({
  remediations,
}: {
  remediations: AssetAdvisoryMatchResponse["remediations"];
}) => {
  if (remediations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Neither the vendor nor CISA lists a fix or mitigation for this device.
        Isolate it from untrusted networks and contact the vendor.
      </p>
    );
  }
  const groups = new Map<
    RemediationResponse["category"],
    RemediationResponse[]
  >();
  for (const remediation of remediations) {
    const group = groups.get(remediation.category) ?? [];
    group.push(remediation);
    groups.set(remediation.category, group);
  }
  return (
    <div className="flex flex-col gap-4">
      {[...groups].map(([category, items]) => {
        const expanded =
          category === "VENDOR_FIX" || items.length <= VISIBLE_STEPS;
        const visible = expanded ? items : items.slice(0, VISIBLE_STEPS);
        const hidden = expanded ? [] : items.slice(VISIBLE_STEPS);
        return (
          <div key={category} className="flex flex-col gap-2">
            <RemediationCategoryBadge category={category} />
            <RemediationSteps items={visible} />
            {hidden.length > 0 && (
              <Disclosure title={`${hidden.length} more steps`}>
                <RemediationSteps items={hidden} />
              </Disclosure>
            )}
          </div>
        );
      })}
    </div>
  );
};

const VISIBLE_STEPS = 4;

const isBareUrl = (text: string) => /^https?:\/\/\S+$/.test(text);

const RemediationSteps = ({ items }: { items: RemediationResponse[] }) => (
  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
    {items.map((item) => (
      <li key={`${item.details}-${item.url}`}>
        {isBareUrl(item.details) ? (
          <ExternalLink href={item.details} className="break-all">
            {item.details}
          </ExternalLink>
        ) : (
          item.details
        )}
        {item.url && item.url !== item.details && (
          <>
            {" "}
            <ExternalLink href={item.url} className="text-xs">
              Vendor guidance
            </ExternalLink>
          </>
        )}
      </li>
    ))}
  </ul>
);

const Vulnerabilities = ({
  vulnerabilities,
}: {
  vulnerabilities: AssetAdvisoryMatchResponse["vulnerabilities"];
}) => (
  <ul className="flex flex-col gap-3">
    {vulnerabilities.map((vulnerability, index) => (
      <li key={vulnerability.cve ?? index} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {vulnerability.cve ? (
            <ExternalLink
              href={`https://nvd.nist.gov/vuln/detail/${vulnerability.cve}`}
              className="font-mono text-xs"
            >
              {vulnerability.cve}
            </ExternalLink>
          ) : (
            <span className="font-mono text-xs">No CVE</span>
          )}
          {vulnerability.cvssScore !== null && (
            <SeverityBadge score={vulnerability.cvssScore} />
          )}
          {vulnerability.cwe && (
            <span className="text-xs text-muted-foreground">
              {vulnerability.cwe}
            </span>
          )}
        </div>
        {vulnerability.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {vulnerability.summary}
          </p>
        )}
      </li>
    ))}
  </ul>
);

const Disclosure = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <details className="group">
    <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <ChevronRightIcon
        className="size-4 transition-transform group-open:rotate-90"
        aria-hidden="true"
      />
      {title}
    </summary>
    <div className="mt-3 pl-5">{children}</div>
  </details>
);

const AdvisoryCard = ({ match }: { match: AssetAdvisoryMatchResponse }) => {
  const { advisory } = match;
  return (
    <article className="flex flex-col gap-4 rounded-lg border bg-background p-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge score={match.severity} />
          <ExposureBadge exposure={match.status} />
          <span className="font-mono text-xs text-muted-foreground">
            {advisory.id}
          </span>
        </div>
        <h3 className="font-semibold leading-snug">{advisory.title}</h3>
        <p className="text-xs text-muted-foreground">
          Released {format(advisory.releasedAt, "MMM d, yyyy")}
          {advisory.revisedAt.getTime() !== advisory.releasedAt.getTime() &&
            ` · Revised ${format(advisory.revisedAt, "MMM d, yyyy")} (${advisory.revision})`}
          {" · "}Detected{" "}
          {formatDistanceToNow(match.firstDetectedAt, { addSuffix: true })}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <SectionTitle>What to do</SectionTitle>
        <Remediations remediations={match.remediations} />
      </section>

      <section className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
        <SectionTitle>Why this device matched</SectionTitle>
        <p className="text-sm">{match.reason}</p>
        {match.affectedProducts.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {match.affectedProducts.map((product) => (
              <li key={`${product.name}-${product.versionSpec}`}>
                {product.name}
                {product.versionSpec && (
                  <span className="font-mono"> · {product.versionSpec}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {advisory.summary && (
          <Disclosure title="Risk">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {advisory.summary}
            </p>
          </Disclosure>
        )}
        {match.vulnerabilities.length > 0 && (
          <Disclosure
            title={`Vulnerabilities (${match.vulnerabilities.length})`}
          >
            <Vulnerabilities vulnerabilities={match.vulnerabilities} />
          </Disclosure>
        )}
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs">
        <ExternalLink href={advisory.url}>Full advisory on CISA</ExternalLink>
        <ExternalLink href={advisory.csafUrl}>CSAF JSON</ExternalLink>
      </footer>
    </article>
  );
};

const ExposureSummary = ({ data }: { data: AssetAdvisoriesResponse }) => {
  const affected = data.matches.filter((m) => m.status === "AFFECTED").length;
  const possible = data.matches.length - affected;
  if (data.matches.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        No CISA medical advisory matches this device. New advisories are checked
        every hour.
      </div>
    );
  }
  const meta = exposureMeta[data.asset.exposure];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        meta.className,
      )}
    >
      <meta.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {affected > 0 &&
          `Affected by ${affected} ${affected === 1 ? "advisory" : "advisories"}. `}
        {possible > 0 &&
          `${possible}${affected > 0 ? " more" : ""} ${possible === 1 ? "advisory may apply" : "advisories may apply"}; confirm the device's version or model.`}
      </span>
    </div>
  );
};

const SheetBody = ({ assetId }: { assetId: string }) => {
  const { data, isPending, isError } = useAssetAdvisories(assetId);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <SheetTitle className="sr-only">Loading advisories</SheetTitle>
        <Loader2Icon className="size-6 animate-spin text-primary" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <>
        <SheetTitle className="sr-only">Advisories unavailable</SheetTitle>
        <ErrorView message="Could not load advisories for this device" />
      </>
    );
  }

  const { asset } = data;
  return (
    <>
      <SheetHeader className="border-b pr-10">
        <SheetTitle>
          {asset.manufacturer} {asset.product}
        </SheetTitle>
        <SheetDescription>
          {[
            asset.deviceType,
            asset.version ? `Version ${asset.version}` : "Version unknown",
            asset.ip,
          ]
            .filter(Boolean)
            .join(" · ")}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
        <ExposureSummary data={data} />
        {data.matches.map((match) => (
          <AdvisoryCard key={match.advisory.id} match={match} />
        ))}
      </div>
    </>
  );
};

export const AssetAdvisoriesSheet = ({
  assetId,
  onClose,
}: {
  assetId: string | null;
  onClose: () => void;
}) => (
  <Sheet open={Boolean(assetId)} onOpenChange={(open) => !open && onClose()}>
    <SheetContent className="w-full gap-0 sm:max-w-xl">
      {assetId ? (
        <SheetBody assetId={assetId} />
      ) : (
        <SheetHeader>
          <SheetTitle>Advisories</SheetTitle>
        </SheetHeader>
      )}
    </SheetContent>
  </Sheet>
);
