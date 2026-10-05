"use client";

import { memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Issue, RiskAssessment } from "@/lib/engine";
import { cn } from "@/lib/utils";
import DebugPanel from "./DebugPanel";
import IssueList from "./IssueList";
import OverviewTab from "./OverviewTab";
import ScoreSummary from "./ScoreSummary";

export type IssueHandlers = {
  activeId: string | null;
  onActive: (id: string | null) => void;
  onLocate: (issue: Issue) => void;
  onFix: (issue: Issue) => void;
  onIgnore: (issue: Issue) => void;
  onAllow: (issue: Issue) => void;
  onCopy: (text: string, label: string) => void;
};

type Props = IssueHandlers & {
  assessment: RiskAssessment;
  hasText: boolean;
  debug: boolean;
  tab: string;
  onTab: (tab: string) => void;
  className?: string;
};

const TRIGGER =
  "h-7 gap-1.5 rounded-md px-3 text-[13px] transition-[color,background-color] duration-200 dark:data-active:border-transparent dark:data-active:bg-background/70";

function ResultsPanel({ assessment, hasText, debug, tab, onTab, className, ...handlers }: Props) {
  const count = assessment.issues.length;
  const current = !debug && tab === "debug" ? "issues" : tab;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <ScoreSummary score={assessment.score} level={hasText ? assessment.level : "empty"} />

      <Tabs value={current} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="px-4 pb-2">
          <TabsList className="h-9 w-full rounded-lg p-1">
            <TabsTrigger value="issues" className={TRIGGER}>
              Issues
              {count > 0 && <span className="text-muted-foreground tabular-nums">{count}</span>}
            </TabsTrigger>
            <TabsTrigger value="overview" className={TRIGGER}>
              Overview
            </TabsTrigger>
            {debug && (
              <TabsTrigger value="debug" className={TRIGGER}>
                Debug
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="px-2.5 pt-1 pb-4">
            <TabsContent value="issues">
              <IssueList issues={assessment.issues} hasText={hasText} {...handlers} />
            </TabsContent>
            <TabsContent value="overview" className="px-1.5">
              <OverviewTab assessment={assessment} hasText={hasText} />
            </TabsContent>
            {debug && (
              <TabsContent value="debug" className="px-1.5">
                {hasText ? (
                  <DebugPanel trace={assessment.debug} />
                ) : (
                  <p className="px-6 py-16 text-center text-sm text-muted-foreground">Nothing to trace yet</p>
                )}
              </TabsContent>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

export default memo(ResultsPanel);
