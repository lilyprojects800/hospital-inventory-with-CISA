import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldQuestionIcon,
  ShieldXIcon,
  WrenchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  Exposure,
  MatchStatus,
  RemediationCategory,
  RemediationLevel,
} from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { severityLabel } from "../lib/match";

const tone = {
  red: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300",
  orange:
    "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300",
  amber:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  green:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  slate: "border-transparent bg-secondary text-muted-foreground",
};

export const exposureMeta = {
  AFFECTED: {
    label: "Affected",
    description: "An advisory matches this device's product and version.",
    icon: ShieldAlertIcon,
    className: tone.red,
  },
  POSSIBLY_AFFECTED: {
    label: "Possibly affected",
    description:
      "The product matches an advisory, but the version or model could not be confirmed.",
    icon: ShieldQuestionIcon,
    className: tone.amber,
  },
  NONE: {
    label: "No known advisories",
    description: "No CISA medical advisory matches this device.",
    icon: ShieldCheckIcon,
    className: tone.slate,
  },
} satisfies Record<Exposure, unknown>;

export const ExposureBadge = ({
  exposure,
  count,
  className,
}: {
  exposure: Exposure | MatchStatus;
  count?: number;
  className?: string;
}) => {
  const meta = exposureMeta[exposure];
  return (
    <Badge
      variant="outline"
      className={cn(meta.className, className)}
      title={meta.description}
    >
      <meta.icon aria-hidden="true" />
      {meta.label}
      {count !== undefined && count > 0 && (
        <span className="tabular-nums">· {count}</span>
      )}
    </Badge>
  );
};

const severityTone = (score: number) => {
  if (score >= 9) return tone.red;
  if (score >= 7) return tone.orange;
  if (score >= 4) return tone.amber;
  return tone.slate;
};

export const SeverityBadge = ({
  score,
  className,
}: {
  score: number;
  className?: string;
}) => (
  <Badge
    variant="outline"
    className={cn(severityTone(score), className)}
    title={`CVSS base score ${score.toFixed(1)}`}
  >
    {severityLabel(score)}
    <span className="tabular-nums">{score.toFixed(1)}</span>
  </Badge>
);

export const remediationLevelMeta = {
  VENDOR_FIX: {
    label: "Vendor fix",
    description: "The vendor has published a fix for every matched advisory.",
    icon: CircleCheckIcon,
    className: tone.green,
  },
  MITIGATION_ONLY: {
    label: "Mitigation only",
    description:
      "At least one matched advisory only has mitigations or workarounds, no vendor fix.",
    icon: WrenchIcon,
    className: tone.amber,
  },
  NO_REMEDIATION: {
    label: "No fix listed",
    description: "At least one matched advisory lists no fix or mitigation.",
    icon: ShieldXIcon,
    className: tone.red,
  },
} satisfies Record<RemediationLevel, unknown>;

export const RemediationBadge = ({ level }: { level: RemediationLevel }) => {
  const meta = remediationLevelMeta[level];
  return (
    <Badge
      variant="outline"
      className={meta.className}
      title={meta.description}
    >
      <meta.icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
};

export const remediationCategoryMeta = {
  VENDOR_FIX: {
    label: "Vendor fix",
    icon: CircleCheckIcon,
    className: tone.green,
  },
  OPTIONAL_PATCH: {
    label: "Optional patch",
    icon: CircleCheckIcon,
    className: tone.green,
  },
  FIX_PLANNED: {
    label: "Fix planned",
    icon: CircleHelpIcon,
    className: tone.amber,
  },
  WORKAROUND: { label: "Workaround", icon: WrenchIcon, className: tone.amber },
  MITIGATION: { label: "Mitigation", icon: WrenchIcon, className: tone.amber },
  NO_FIX_PLANNED: {
    label: "No fix planned",
    icon: CircleAlertIcon,
    className: tone.red,
  },
  NONE_AVAILABLE: {
    label: "No fix available",
    icon: CircleAlertIcon,
    className: tone.red,
  },
} satisfies Record<RemediationCategory, unknown>;

export const RemediationCategoryBadge = ({
  category,
}: {
  category: RemediationCategory;
}) => {
  const meta = remediationCategoryMeta[category];
  return (
    <Badge variant="outline" className={meta.className}>
      <meta.icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
};
