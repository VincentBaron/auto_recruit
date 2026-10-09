"use client";

import { useState } from "react";
import { FilePlus, Scale } from "lucide-react";
import { addDays } from "@/lib/dates";
import { daysUntil, formatDate, formatNumber, formatRelative } from "@/lib/format";
import { RETENTION } from "@/lib/labels";
import type { DataRequestKind } from "@/lib/types";
import { useAppState, useBackendError } from "@/lib/api";
import { AuditLog, SuppressionList } from "./privacy-lists";
import { DataRequests, RecordRequestDialog } from "./privacy-requests";
import { useRunner } from "./shared";
import { Button, Callout, Flash, NoWorkspace, SettingsPage, SettingsSkeleton, StatGrid, StatTile, Tabs, useFlash } from "./ui";

const TITLE = "Data & privacy";
const DESCRIPTION = "Data Requests, the Suppression List and the audit log. Every Data Request is due within one month.";

export type PrivacyTab = "requests" | "suppression" | "audit";

export function PrivacyScreen({ initialTab, initialPerson, initialKind }: { initialTab: PrivacyTab; initialPerson: string | null; initialKind: DataRequestKind }) {
  const s = useAppState();
  const loadError = useBackendError();
  const [flash, setFlash] = useFlash();
  const { pending, run } = useRunner(setFlash);
  const [tab, setTab] = useState<PrivacyTab>(initialPerson ? "requests" : initialTab);
  const [recording, setRecording] = useState(initialPerson !== null);
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);

  if (!s) return <SettingsSkeleton title={TITLE} description={DESCRIPTION} error={loadError} />;
  if (!s.workspace) return <NoWorkspace title={TITLE} description={DESCRIPTION} what="answer Data Requests and keep the Suppression List" />;

  const today = s.clock.today;
  const open = s.dataRequests.filter((d) => d.status === "open").sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));
  const next = open[0] ?? null;
  const nextDays = next ? daysUntil(next.dueOn, today) : 0;
  // The most urgent open request starts expanded until the Recruiter picks another one.
  const expandedId = expanded === undefined ? (next?.id ?? null) : expanded;
  const fromOtherWorkspaces = s.suppressionList.filter((e) => e.addedBy === "another_workspace").length;

  return (
    <SettingsPage
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <Button variant="primary" icon={FilePlus} onClick={() => setRecording(true)}>
          Record a Data Request
        </Button>
      }
    >
      <Flash flash={flash} onClose={() => setFlash(null)} />

      <Callout tone="info" icon={Scale}>
        {s.workspace.name} is the data controller for its Candidates, Hiring Contacts and outreach; Auto Recruit processes that data on its behalf, in the EU.
      </Callout>

      <StatGrid>
        <StatTile label="Open Data Requests" value={open.length} hint={open.length === 0 ? "Nothing to answer" : `${s.dataRequests.length - open.length} completed`} />
        <StatTile
          label="Next due"
          value={next ? (nextDays < 0 ? "Overdue" : formatRelative(next.dueOn, today)) : "-"}
          tone={next && nextDays <= 3 ? "danger" : next && nextDays <= 10 ? "warning" : "default"}
          hint={next ? `${next.personQuery}, ${formatDate(next.dueOn)}` : "No open request"}
        />
        <StatTile label="Suppression List" value={formatNumber(s.suppressionList.length)} hint={`${fromOtherWorkspaces} from other Workspaces`} />
        <StatTile label="Audit events" value={formatNumber(s.auditLog.length)} hint="Who, when and what" />
      </StatGrid>

      <Tabs<PrivacyTab>
        label="Data and privacy sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "requests", label: "Data Requests", count: open.length },
          { key: "suppression", label: "Suppression List", count: s.suppressionList.length },
          { key: "audit", label: "Audit log", count: s.auditLog.length },
        ]}
      />

      {tab === "requests" ? (
        <DataRequests s={s} pending={pending} run={run} expanded={expandedId} setExpanded={setExpanded} onRecord={() => setRecording(true)} />
      ) : null}
      {tab === "suppression" ? <SuppressionList s={s} pending={pending} run={run} /> : null}
      {tab === "audit" ? <AuditLog s={s} /> : null}

      <RecordRequestDialog
        open={recording}
        s={s}
        initialPerson={initialPerson ?? ""}
        initialKind={initialKind}
        busy={pending === "record"}
        onClose={() => setRecording(false)}
        onSubmit={async (payload) => {
          const r = await run("record", "createDataRequest", payload, () => ({
            tone: "success",
            text: `Data Request from ${payload.personQuery} recorded. Due ${formatDate(addDays(today, RETENTION.dataRequestDueDays))}.`,
          }));
          if (!r) return false;
          setTab("requests");
          setExpanded(r.dataRequestId);
          return true;
        }}
      />
    </SettingsPage>
  );
}

