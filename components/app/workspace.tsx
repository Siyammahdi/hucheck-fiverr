"use client";

import { ChevronUpIcon } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Composer from "@/components/checker/Composer";
import type { EditorHandle } from "@/components/checker/HighlightEditor";
import ResultsPanel from "@/components/checker/ResultsPanel";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Example } from "@/config/examples";
import { useEvent } from "@/hooks/use-event";
import { useMediaQuery } from "@/hooks/use-media-query";
import { applyAll, applyIssue, assess, issueKey } from "@/lib/engine";
import type { Issue, TeamRule } from "@/lib/engine";
import { upsertHistory, type HistoryEntry } from "@/lib/history";
import { LEVEL_META, SENSITIVITY, type Sensitivity } from "@/lib/risk-ui";
import { SHARED_RULES } from "@/lib/teamRules";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { cn } from "@/lib/utils";
import AppSidebar from "./app-sidebar";
import CommandMenu from "./command-menu";
import SettingsDialog from "./settings-dialog";
import SiteHeader from "./site-header";
import TeamRulesSheet from "./team-rules-sheet";

const NO_RULES: TeamRule[] = [];
const NO_STRINGS: string[] = [];
const NO_HISTORY: HistoryEntry[] = [];
const STORAGE_KEYS = ["fmc:rules", "fmc:allow", "fmc:sensitivity", "fmc:debug", "fmc:highlights", "fmc:saveHistory", "fmc:history"];

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

export default function Workspace() {
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [localRules, setLocalRules] = useLocalStorage<TeamRule[]>("fmc:rules", NO_RULES);
  const [allow, setAllow] = useLocalStorage<string[]>("fmc:allow", NO_STRINGS);
  const [sensitivity, setSensitivity] = useLocalStorage<Sensitivity>("fmc:sensitivity", "strict");
  const [debug, setDebug] = useLocalStorage<boolean>("fmc:debug", false);
  const [highlights, setHighlights] = useLocalStorage<boolean>("fmc:highlights", true);
  const [saveHistory, setSaveHistory] = useLocalStorage<boolean>("fmc:saveHistory", true);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("fmc:history", NO_HISTORY);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [savedText, setSavedText] = useState("");
  const [tab, setTab] = useState("issues");
  const [commandOpen, setCommandOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const flash = useRef<ReturnType<typeof setTimeout>>(undefined);
  const undoStack = useRef<string[]>([]);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Results render at low priority so typing and pasting never wait for them.
  const checked = useDeferredValue(text);
  const teamRules = useMemo(() => [...SHARED_RULES, ...localRules], [localRules]);
  const ignore = useMemo(() => [...allow, ...ignored], [allow, ignored]);
  const assessment = useMemo(
    () => assess(checked, { teamRules, minSeverity: SENSITIVITY[sensitivity].min, ignore, debug }),
    [checked, teamRules, sensitivity, ignore, debug]
  );
  const issues = assessment.issues;
  const hasText = text.trim().length > 0;
  const hasChecked = checked.trim().length > 0;
  const level = hasChecked ? assessment.level : "empty";
  const canFlag = selection.trim().length >= 3 && selection.trim().length <= 120;

  useEffect(() => {
    if (!saveHistory || checked.trim().length < 12 || checked === savedText) return;
    const timer = setTimeout(() => {
      setSavedText(checked);
      setHistory((prev) =>
        upsertHistory(prev, { id: sessionId, text: checked, level: assessment.level, score: assessment.score, at: Date.now() })
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [checked, savedText, assessment.level, assessment.score, sessionId, saveHistory, setHistory]);

  const startNew = useCallback(() => {
    setSessionId(crypto.randomUUID());
    setSavedText("");
    setText("");
    setIgnored([]);
    setActiveId(null);
    setTab("issues");
    requestAnimationFrame(() => editor.current?.focus());
  }, []);

  const openEntry = useCallback((h: HistoryEntry) => {
    setSessionId(h.id);
    setSavedText(h.text);
    setText(h.text);
    setIgnored([]);
    setActiveId(null);
  }, []);

  const loadExample = (e: Example) => {
    startNew();
    setText(e.text);
  };

  const copyMessage = useCallback(async () => {
    if (!text.trim()) return false;
    await writeClipboard(text);
    toast.success("Message copied", {
      description: issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"} still open` : undefined,
    });
    return true;
  }, [text, issues.length]);

  const copySnippet = useCallback(async (value: string, label: string) => {
    await writeClipboard(value);
    toast.success(`${label} copied`);
  }, []);

  // Issue offsets belong to `checked`, so fixes are applied to that text.
  const pushUndo = useEvent(() => {
    undoStack.current.push(text);
    if (undoStack.current.length > 50) undoStack.current.shift();
  });

  const undo = useEvent(() => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return false;
    setText(prev);
    requestAnimationFrame(() => editor.current?.focus());
    return true;
  });

  const fixAll = () => {
    if (!issues.length) return;
    const count = issues.length;
    pushUndo();
    setText(applyAll(checked, issues));
    toast.success(`Fixed ${count} issue${count === 1 ? "" : "s"}`, {
      description: "Press Ctrl+Z to undo",
      action: { label: "Undo", onClick: undo },
    });
  };

  const fixOne = useEvent((i: Issue) => {
    pushUndo();
    setText(applyIssue(checked, i));
    toast.success("Fixed", { description: "Press Ctrl+Z to undo", action: { label: "Undo", onClick: undo } });
  });

  const ignoreOnce = useCallback((i: Issue) => {
    const key = issueKey(i);
    setIgnored((p) => [...p, key]);
    toast("Ignored for this message", {
      action: { label: "Undo", onClick: () => setIgnored((p) => p.filter((k) => k !== key)) },
    });
  }, []);

  const alwaysAllow = useCallback(
    (i: Issue) => {
      const key = issueKey(i);
      setAllow((p) => (p.includes(key) ? p : [...p, key]));
      toast.success("Always allowed", {
        action: { label: "Undo", onClick: () => setAllow((p) => p.filter((k) => k !== key)) },
      });
    },
    [setAllow]
  );

  const locate = useEvent((i: Issue) => {
    setDrawerOpen(false);
    editor.current?.focusRange(i.start, i.end);
    setActiveId(i.id);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setActiveId((cur) => (cur === i.id ? null : cur)), 1200);
  });

  const openSearch = useCallback(() => setCommandOpen(true), []);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const deleteEntry = useCallback((id: string) => setHistory((prev) => prev.filter((h) => h.id !== id)), [setHistory]);

  const flagSelection = () => {
    const phrase = selection.trim().replace(/\s+/g, " ");
    if (!canFlag) return;
    if (localRules.some((r) => r.phrase.toLowerCase() === phrase.toLowerCase())) {
      toast.info("Already a rule");
      return;
    }
    const id = crypto.randomUUID();
    setLocalRules((prev) => [...prev, { id, phrase, severity: "medium", suggestion: "" }]);
    toast.success("Rule added", {
      description: `“${phrase}”`,
      action: { label: "Undo", onClick: () => setLocalRules((prev) => prev.filter((r) => r.id !== id)) },
    });
  };

  const openSettings = useCallback((t = "general") => {
    setSettingsTab(t);
    setSettingsOpen(true);
  }, []);

  const changeDebug = (on: boolean) => {
    setDebug(on);
    if (on) setTab("debug");
  };

  const clearAll = () => {
    for (const key of STORAGE_KEYS) localStorage.removeItem(key);
    window.dispatchEvent(new Event("fmc:storage"));
    startNew();
    toast.success("Local data deleted");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        startNew();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        openSettings();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        // Undo an applied fix. When nothing is on our stack, let the browser
        // handle its own undo (e.g. typing in the textarea).
        if (undoStack.current.length) {
          e.preventDefault();
          undo();
        }
      } else if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        openSettings("shortcuts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNew, openSettings, undo]);

  const results = (
    <ResultsPanel
      assessment={assessment}
      hasText={hasChecked}
      debug={debug}
      tab={tab}
      onTab={setTab}
      activeId={activeId}
      onActive={setActiveId}
      onLocate={locate}
      onFix={fixOne}
      onIgnore={ignoreOnce}
      onAllow={alwaysAllow}
      onCopy={copySnippet}
    />
  );

  const compose = (
    <div className="flex h-full min-h-0 flex-col">
      <SiteHeader sensitivity={sensitivity} onSensitivity={setSensitivity} />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <Composer
          ref={editor}
          value={text}
          onChange={setText}
          checkedText={checked}
          issues={issues}
          activeId={activeId}
          highlights={highlights}
          onHighlights={setHighlights}
          canFlag={canFlag}
          onFlag={flagSelection}
          onCopy={copyMessage}
          onFixAll={fixAll}
          onInsert={(t) => editor.current?.insertAtCursor(t)}
          onExample={loadExample}
          onSelectionChange={setSelection}
        />
        {!isDesktop && hasText && (
          <div className="sticky bottom-4 flex animate-in justify-center px-4 pb-4 duration-300 fade-in-0 slide-in-from-bottom-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm font-medium transition-[background-color,scale] duration-150 active:scale-[0.97] active:bg-muted"
            >
              <span className={cn("size-2 rounded-full", LEVEL_META[level].dot)} />
              {LEVEL_META[level].label}
              {issues.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  · {issues.length} {issues.length === 1 ? "issue" : "issues"}
                </span>
              )}
              <ChevronUpIcon className="size-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <SidebarProvider>
      <AppSidebar
        history={history}
        currentId={sessionId}
        ruleCount={localRules.length}
        onNew={startNew}
        onSearch={openSearch}
        onRules={openRules}
        onSettings={openSettings}
        onOpenEntry={openEntry}
        onDeleteEntry={deleteEntry}
      />

      <SidebarInset className="h-svh overflow-hidden">
        {isDesktop ? (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel id="compose" defaultSize="62%" minSize="45%">
              {compose}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="results" defaultSize="38%" minSize="28%" maxSize="50%">
              {results}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          compose
        )}
      </SidebarInset>

      {!isDesktop && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="h-[85svh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Results</DrawerTitle>
              <DrawerDescription>Risk score and issues</DrawerDescription>
            </DrawerHeader>
            {results}
          </DrawerContent>
        </Drawer>
      )}

      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        hasText={hasText}
        issueCount={issues.length}
        canFlag={canFlag}
        sensitivity={sensitivity}
        debug={debug}
        onFixAll={fixAll}
        onCopy={() => void copyMessage()}
        onNew={startNew}
        onFlag={flagSelection}
        onInsert={(t) => editor.current?.insertAtCursor(t)}
        onExample={loadExample}
        onSensitivity={setSensitivity}
        onDebug={changeDebug}
        onTab={(t) => {
          setTab(t);
          if (!isDesktop) setDrawerOpen(true);
        }}
        onOpenRules={() => setRulesOpen(true)}
        onOpenSettings={() => openSettings()}
      />
      <TeamRulesSheet
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        rules={localRules}
        onRules={setLocalRules}
        shared={SHARED_RULES}
        allow={allow}
        onAllow={setAllow}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        tab={settingsTab}
        onTab={setSettingsTab}
        sensitivity={sensitivity}
        onSensitivity={setSensitivity}
        debug={debug}
        onDebug={changeDebug}
        highlights={highlights}
        onHighlights={setHighlights}
        saveHistory={saveHistory}
        onSaveHistory={setSaveHistory}
        historyCount={history.length}
        onClearHistory={() => {
          setHistory([]);
          toast.success("History cleared");
        }}
        onClearAll={clearAll}
      />
    </SidebarProvider>
  );
}
