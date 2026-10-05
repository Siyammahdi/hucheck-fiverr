"use client";

import { DownloadIcon, PlusIcon, SearchIcon, ShieldOffIcon, Trash2Icon, UploadIcon, UsersIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Severity, TeamRule } from "@/lib/engine";
import { SEVERITY_META } from "@/lib/risk-ui";
import { cn } from "@/lib/utils";

type Setter<T> = (next: T | ((prev: T) => T)) => void;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: TeamRule[];
  onRules: Setter<TeamRule[]>;
  shared: TeamRule[];
  allow: string[];
  onAllow: Setter<string[]>;
};

const SEVERITIES: Severity[] = ["high", "medium", "low"];

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", SEVERITY_META[severity].bg, SEVERITY_META[severity].text)}>
      {SEVERITY_META[severity].label}
    </Badge>
  );
}

export default function TeamRulesSheet({ open, onOpenChange, rules, onRules, shared, allow, onAllow }: Props) {
  const [phrase, setPhrase] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [suggestion, setSuggestion] = useState("");
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredShared = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? shared.filter((r) => r.phrase.toLowerCase().includes(q)) : shared;
  }, [shared, query]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const p = phrase.trim();
    if (!p) return;
    if (rules.some((r) => r.phrase.toLowerCase() === p.toLowerCase())) {
      toast.info("That phrase is already a rule");
      return;
    }
    onRules((prev) => [...prev, { id: crypto.randomUUID(), phrase: p, severity, suggestion: suggestion.trim() }]);
    toast.success("Rule added", { description: `“${p}” will now be flagged.` });
    setPhrase("");
    setSuggestion("");
  };

  const exportRules = () => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team-rules.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rules exported", { description: "Saved as team-rules.json." });
  };

  const importRules = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error("not an array");
      const valid: TeamRule[] = data
        .filter(
          (r): r is { phrase: string; severity: Severity; suggestion?: string } =>
            !!r && typeof r.phrase === "string" && r.phrase.trim() !== "" && SEVERITIES.includes(r.severity)
        )
        .map((r) => ({
          id: crypto.randomUUID(),
          phrase: r.phrase.trim(),
          severity: r.severity,
          suggestion: typeof r.suggestion === "string" ? r.suggestion : "",
        }));
      if (!valid.length) throw new Error("no valid rules");
      onRules((prev) => [...prev, ...valid]);
      toast.success(`Imported ${valid.length} rule${valid.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("That file is not a valid rules file");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" />
            Team rules
          </SheetTitle>
          <SheetDescription className="sr-only">Phrases your team wants flagged, and allowed text</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="mine" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="mine">
                My rules <Badge variant="secondary" className="tabular-nums">{rules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="shared">
                Shared <Badge variant="secondary" className="tabular-nums">{shared.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="allowed">
                Allowed <Badge variant="secondary" className="tabular-nums">{allow.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <TabsContent value="mine" className="flex flex-col gap-5 p-4">
              <form onSubmit={add} className="rounded-xl border p-4">
                <FieldGroup className="gap-4">
                  <div className="grid gap-4 sm:grid-cols-[1fr_8.5rem]">
                    <Field>
                      <FieldLabel htmlFor="rule-phrase">Phrase to flag</FieldLabel>
                      <Input
                        id="rule-phrase"
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        placeholder="e.g. outside the platform"
                        autoComplete="off"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="rule-severity">Severity</FieldLabel>
                      <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                        <SelectTrigger id="rule-severity" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITIES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <span className={cn("size-2 rounded-full", SEVERITY_META[s].dot)} />
                              {SEVERITY_META[s].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="rule-suggestion">Replacement or advice</FieldLabel>
                    <Textarea
                      id="rule-suggestion"
                      value={suggestion}
                      onChange={(e) => setSuggestion(e.target.value)}
                      placeholder="Optional"
                      title="A few words replace the phrase. A full sentence is shown as advice."
                      className="min-h-16"
                    />
                  </Field>
                  <Button type="submit" disabled={!phrase.trim()} className="self-end">
                    <PlusIcon data-icon="inline-start" />
                    Add rule
                  </Button>
                </FieldGroup>
              </form>

              {rules.length ? (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Phrase</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="max-w-56 pl-4 whitespace-normal">
                            <div className="font-medium">{r.phrase}</div>
                            {r.suggestion && <div className="text-xs text-muted-foreground">→ {r.suggestion}</div>}
                          </TableCell>
                          <TableCell>
                            <SeverityBadge severity={r.severity} />
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Remove ${r.phrase}`}
                                  onClick={() => onRules((prev) => prev.filter((x) => x.id !== r.id))}
                                >
                                  <Trash2Icon />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UsersIcon />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm font-normal text-muted-foreground">No rules yet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>

            <TabsContent value="shared" className="flex flex-col gap-3 p-4">
              <InputGroup>
                <InputGroupInput placeholder="Filter shared rules…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="tabular-nums">{filteredShared.length}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableBody>
                    {filteredShared.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-4 whitespace-normal">
                          <div className="font-medium">{r.phrase}</div>
                          {r.suggestion && <div className="text-xs text-muted-foreground">→ {r.suggestion}</div>}
                        </TableCell>
                        <TableCell className="w-24 text-right">
                          <SeverityBadge severity={r.severity} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="allowed" className="p-4">
              {allow.length ? (
                <div className="flex flex-wrap gap-2">
                  {allow.map((k) => (
                    <Badge key={k} variant="secondary" className="h-7 gap-1 rounded-full pr-1 pl-3 text-sm">
                      {k.split("|")[1] ?? k}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-5 rounded-full"
                        aria-label={`Stop allowing ${k.split("|")[1] ?? k}`}
                        onClick={() => onAllow((prev) => prev.filter((x) => x !== k))}
                      >
                        <XIcon />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ShieldOffIcon />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm font-normal text-muted-foreground">Nothing allowed yet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="flex-row items-center border-t">
          <ButtonGroup>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <UploadIcon data-icon="inline-start" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportRules} disabled={!rules.length}>
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
          </ButtonGroup>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importRules(f);
            }}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto text-destructive" disabled={!rules.length && !allow.length}>
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive">
                  <Trash2Icon />
                </AlertDialogMedia>
                <AlertDialogTitle>Remove all your rules?</AlertDialogTitle>
                <AlertDialogDescription>Shared rules are not affected.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    onRules([]);
                    onAllow([]);
                    toast.success("Rules reset");
                  }}
                >
                  Remove all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
