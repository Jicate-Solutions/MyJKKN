"use client";

/**
 * InstitutionSemesterPicker — the drive form's audience selector.
 *
 * Step 1: pick an institution from the dropdown — its programs & semesters
 * section opens right away (2026-09-24). Step 2: inside that section, each
 * degree type (UG / PG …) is its own block with its OWN programs and
 * semesters (2026-09-28), read from the institution's real `semesters` master
 * (/api/cdc/pickers/institution-semesters). "UG Sem 7 + PG Sem 3" therefore
 * never bleeds across: the choice is saved per block in
 * institution_semesters[].degree_semesters.
 *
 * Nothing ticked in any block = every learner of the institution. Once any
 * block has a tick, only ticked blocks are targeted; inside a block, no program
 * ticked = all its programs and no semester ticked = all its semesters.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCdcInstitutionSemesters,
  useCdcProgramOptionsAll,
  type CdcPickerProgramOption,
} from "@/hooks/cdc/use-cdc-drives";
import type {
  CdcDriveDegreeSemesterTarget,
  CdcDriveInstitutionSemesterTarget,
  CdcDriveInstitutionSemesters,
  CdcDriveTargetGender,
} from "@/types/cdc";

export interface PickerInstitution {
  id: string;
  name: string;
}

interface Props {
  institutions: PickerInstitution[];
  institutionsLoading?: boolean;
  institutionsError?: string | null;
  selectedInstitutions: string[];
  onSelectedInstitutionsChange: (ids: string[]) => void;
  targeting: CdcDriveInstitutionSemesters;
  onTargetingChange: (next: CdcDriveInstitutionSemesters) => void;
  disabled?: boolean;
  /**
   * Programs saved on the drive's eligibility record ("Who is eligible"). When a
   * targeting entry has no programs of its own, the matching ones for that
   * institution are pre-ticked once the options load, so the two places agree.
   */
  fallbackProgramIds?: string[];
  /** The drive-level "Open to" choice; a block shows it until it sets its own. */
  driveGender?: CdcDriveTargetGender;
}

/** One degree block as rendered: its programs and its semester range. */
interface UiGroup {
  key: string;
  label: string;
  orders: number[];
  programs: CdcPickerProgramOption[];
  /** Every program id of the block (semester-master ids ∪ program-option ids). */
  allIds: string[];
}

/** What is ticked in one block. */
interface GroupPick {
  programs: string[];
  orders: number[];
  /** Block's own gender; undefined = follow the drive-level choice. */
  gender?: CdcDriveTargetGender;
  /** Gender per ticked program (programs.id → gender); absent = follow the block. */
  programGenders?: Record<string, CdcDriveTargetGender>;
}

const GENDER_OPTIONS: Array<{ value: CdcDriveTargetGender; label: string }> = [
  { value: "all", label: "Both" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const OTHER_KEY = "__OTHER__";

export function InstitutionSemesterPicker({
  institutions,
  institutionsLoading,
  institutionsError,
  selectedInstitutions,
  onSelectedInstitutionsChange,
  targeting,
  onTargetingChange,
  disabled,
  fallbackProgramIds,
  driveGender = "all",
}: Props) {
  const {
    data: semData,
    isLoading: semLoading,
    isError: semIsError,
  } = useCdcInstitutionSemesters(selectedInstitutions);
  const {
    data: programOptions,
    isLoading: progLoading,
    isError: progIsError,
  } = useCdcProgramOptionsAll(selectedInstitutions.length > 0);
  const programsByInst = useMemo(() => {
    const m = new Map<string, CdcPickerProgramOption[]>();
    (programOptions ?? []).forEach((o) => {
      if (!o.institution_id) return;
      const list = m.get(o.institution_id) ?? [];
      list.push(o);
      m.set(o.institution_id, list);
    });
    return m;
  }, [programOptions]);

  /** Degree blocks per institution: API groups + an "Other programs" block for programs with no semester rows. */
  const groupsByInst = useMemo(() => {
    const m = new Map<string, UiGroup[]>();
    for (const instId of selectedInstitutions) {
      const progs = programsByInst.get(instId) ?? [];
      const used = new Set<string>();
      const groups: UiGroup[] = (semData?.degrees?.[instId] ?? []).map((g) => {
        const ids = new Set(g.program_ids);
        const programs = progs.filter((o) => o.ids.some((id) => ids.has(id)));
        programs.forEach((o) => used.add(o.value));
        return {
          key: g.key,
          label: g.label,
          orders: g.orders,
          programs,
          allIds: Array.from(new Set([...g.program_ids, ...programs.flatMap((o) => o.ids)])),
        };
      });
      const leftover = progs.filter((o) => !used.has(o.value));
      if (leftover.length > 0 && groups.length > 0) {
        groups.push({
          key: OTHER_KEY,
          label: "Other programs",
          orders: [],
          programs: leftover,
          allIds: leftover.flatMap((o) => o.ids),
        });
      }
      m.set(instId, groups);
    }
    return m;
  }, [selectedInstitutions, semData, programsByInst]);

  // One-time seed from eligibility.program_ids (per institution, only where the
  // entry has no programs yet).
  const seededFromFallback = useRef(false);
  useEffect(() => {
    if (
      seededFromFallback.current ||
      !programOptions ||
      !fallbackProgramIds?.length
    )
      return;
    seededFromFallback.current = true;
    const fallback = new Set(fallbackProgramIds);
    let changed = false;
    const next = targeting.map((t) => {
      if (t.degree_semesters?.length) return t;
      if (t.program_ids && t.program_ids.length > 0) return t;
      const instIds = (programsByInst.get(t.institution_id) ?? []).flatMap(
        (o) => o.ids,
      );
      const matched = instIds.filter((id) => fallback.has(id));
      if (matched.length === 0) return t;
      changed = true;
      return { ...t, program_ids: matched };
    });
    if (changed) onTargetingChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programOptions, fallbackProgramIds]);

  // Sections open when added from the dropdown; existing ones (edit) start open too.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(selectedInstitutions),
  );
  function setSectionOpen(id: string, open: boolean) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.id, i.name));
    return m;
  }, [institutions]);

  function entryFor(instId: string): CdcDriveInstitutionSemesterTarget | undefined {
    return targeting.find((t) => t.institution_id === instId);
  }

  /**
   * Current ticks per block. Saved degree_semesters win; an older flat entry
   * (program_ids / semester_orders only) is split across the blocks.
   */
  function picksFor(instId: string): Map<string, GroupPick> {
    const groups = groupsByInst.get(instId) ?? [];
    const entry = entryFor(instId);
    const picks = new Map<string, GroupPick>();
    if (entry?.degree_semesters?.length) {
      for (const g of entry.degree_semesters) {
        picks.set(g.key, {
          programs: g.program_ids,
          orders: g.semester_orders,
          gender: g.gender,
          programGenders: g.program_genders,
        });
      }
      return picks;
    }
    const flatPrograms = entry?.program_ids ?? [];
    const flatOrders = entry?.semester_orders ?? [];
    if (flatPrograms.length === 0 && flatOrders.length === 0) return picks;
    for (const g of groups) {
      const programs = flatPrograms.filter((id) => g.allIds.includes(id));
      const orders = flatOrders.filter((o) => g.orders.includes(o));
      if (flatPrograms.length > 0 && programs.length === 0) continue;
      if (flatOrders.length > 0 && orders.length === 0 && g.orders.length > 0) continue;
      picks.set(g.key, { programs, orders });
    }
    return picks;
  }

  /** Build the stored entry from per-block ticks. */
  function buildEntry(
    instId: string,
    picks: Map<string, GroupPick>,
  ): CdcDriveInstitutionSemesterTarget {
    const groups = groupsByInst.get(instId) ?? [];
    const degree_semesters: CdcDriveDegreeSemesterTarget[] = [];
    for (const g of groups) {
      const p = picks.get(g.key);
      if (
        !p ||
        (p.programs.length === 0 && p.orders.length === 0 && p.gender === undefined)
      )
        continue;
      degree_semesters.push({
        key: g.key,
        program_ids: Array.from(new Set(p.programs)),
        all_program_ids: g.allIds,
        semester_orders: Array.from(new Set(p.orders)).sort((a, b) => a - b),
        ...(p.gender !== undefined ? { gender: p.gender } : {}),
        ...(() => {
          // Only ticked programs can carry their own gender.
          const kept = Object.fromEntries(
            Object.entries(p.programGenders ?? {}).filter(([id]) =>
              p.programs.includes(id),
            ),
          );
          return Object.keys(kept).length > 0 ? { program_genders: kept } : {};
        })(),
      });
    }
    if (degree_semesters.length === 0) {
      return { institution_id: instId, semester_orders: [], program_ids: [] };
    }
    const anyAllSemesters = degree_semesters.some(
      (g) => g.semester_orders.length === 0,
    );
    return {
      institution_id: instId,
      semester_orders: anyAllSemesters
        ? []
        : Array.from(
            new Set(degree_semesters.flatMap((g) => g.semester_orders)),
          ).sort((a, b) => a - b),
      program_ids: Array.from(
        new Set(
          degree_semesters.flatMap((g) =>
            g.program_ids.length > 0 ? g.program_ids : g.all_program_ids,
          ),
        ),
      ),
      degree_semesters,
    };
  }

  function writeEntry(instId: string, entry: CdcDriveInstitutionSemesterTarget) {
    onTargetingChange([
      ...targeting.filter((t) => t.institution_id !== instId),
      entry,
    ]);
  }

  function setGroupPick(instId: string, key: string, pick: GroupPick) {
    const picks = picksFor(instId);
    picks.set(key, pick);
    writeEntry(instId, buildEntry(instId, picks));
  }

  function toggleGroupOrder(instId: string, key: string, order: number) {
    const cur = picksFor(instId).get(key) ?? { programs: [], orders: [] };
    setGroupPick(instId, key, {
      gender: cur.gender,
      programGenders: cur.programGenders,
      programs: cur.programs,
      orders: cur.orders.includes(order)
        ? cur.orders.filter((o) => o !== order)
        : [...cur.orders, order],
    });
  }

  /** A program option covers several master ids; toggle them as one. */
  function toggleGroupProgram(instId: string, key: string, optionIds: string[]) {
    const cur = picksFor(instId).get(key) ?? { programs: [], orders: [] };
    const on = optionIds.some((id) => cur.programs.includes(id));
    setGroupPick(instId, key, {
      gender: cur.gender,
      programGenders: cur.programGenders,
      orders: cur.orders,
      programs: on
        ? cur.programs.filter((id) => !optionIds.includes(id))
        : [...cur.programs, ...optionIds],
    });
  }

  /** Tick every program of a block (or untick them all when all are ticked). */
  function toggleAllGroupPrograms(instId: string, g: UiGroup) {
    const cur = picksFor(instId).get(g.key) ?? { programs: [], orders: [] };
    const all = g.programs.flatMap((o) => o.ids);
    const allOn = g.programs.every((o) =>
      o.ids.some((id) => cur.programs.includes(id)),
    );
    setGroupPick(instId, g.key, {
      gender: cur.gender,
      programGenders: cur.programGenders,
      orders: cur.orders,
      programs: allOn ? [] : all,
    });
  }

  /** Gender for ONE ticked program (all its duplicate master ids). Picking the block's value clears it. */
  function setProgramGender(
    instId: string,
    key: string,
    optionIds: string[],
    gender: CdcDriveTargetGender,
  ) {
    const cur = picksFor(instId).get(key) ?? { programs: [], orders: [] };
    const next = { ...(cur.programGenders ?? {}) };
    const blockGender = cur.gender ?? driveGender;
    for (const id of optionIds) {
      if (gender === blockGender) delete next[id];
      else next[id] = gender;
    }
    setGroupPick(instId, key, { ...cur, programGenders: next });
  }

  /** Block-level gender. Picking the drive-level value again clears the override. */
  function setGroupGender(instId: string, key: string, gender: CdcDriveTargetGender) {
    const cur = picksFor(instId).get(key) ?? { programs: [], orders: [] };
    setGroupPick(instId, key, {
      programs: cur.programs,
      orders: cur.orders,
      programGenders: cur.programGenders,
      gender: gender === driveGender ? undefined : gender,
    });
  }

  function addAllInstitutions() {
    const missing = institutions.filter((i) => !selectedInstitutions.includes(i.id));
    if (missing.length === 0) return;
    onSelectedInstitutionsChange([...selectedInstitutions, ...missing.map((i) => i.id)]);
    onTargetingChange([
      ...targeting,
      ...missing.map((i) => ({ institution_id: i.id, semester_orders: [], program_ids: [] })),
    ]);
    // Left collapsed: opening every institution at once is a very long page.
  }

  function addInstitution(id: string) {
    if (!id || selectedInstitutions.includes(id)) return;
    onSelectedInstitutionsChange([...selectedInstitutions, id]);
    onTargetingChange([
      ...targeting,
      { institution_id: id, semester_orders: [], program_ids: [] },
    ]);
    setSectionOpen(id, true);
  }
  function removeInstitution(id: string) {
    onSelectedInstitutionsChange(selectedInstitutions.filter((i) => i !== id));
    onTargetingChange(targeting.filter((t) => t.institution_id !== id));
    setSectionOpen(id, false);
  }

  /** Copy one institution's per-block semesters to the same blocks of every other institution. */
  function applyToAll(fromInst: string) {
    const source = picksFor(fromInst);
    const next: CdcDriveInstitutionSemesters = selectedInstitutions.map((id) => {
      if (id === fromInst) return entryFor(id) ?? buildEntry(id, source);
      const picks = picksFor(id);
      for (const g of groupsByInst.get(id) ?? []) {
        const src = source.get(g.key);
        if (!src) continue;
        const cur = picks.get(g.key) ?? { programs: [], orders: [] };
        picks.set(g.key, {
          gender: cur.gender,
          programGenders: cur.programGenders,
          programs: cur.programs,
          orders: src.orders.filter((o) => g.orders.includes(o)),
        });
      }
      return buildEntry(id, picks);
    });
    onTargetingChange(next);
  }

  function summaryFor(instId: string): string {
    const picks = picksFor(instId);
    if (picks.size === 0) return "All programs · All semesters";
    const groups = groupsByInst.get(instId) ?? [];
    return groups
      .filter((g) => picks.has(g.key))
      .map((g) => {
        const p = picks.get(g.key)!;
        const progCount = g.programs.filter((o) =>
          o.ids.some((id) => p.programs.includes(id)),
        ).length;
        const progText =
          progCount === 0
            ? "all programs"
            : `${progCount} program${progCount === 1 ? "" : "s"}`;
        const semText =
          g.orders.length === 0
            ? ""
            : p.orders.length === 0
              ? " · all semesters"
              : ` · Sem ${[...p.orders].sort((a, b) => a - b).join(", ")}`;
        const perProgram = Object.keys(p.programGenders ?? {}).some((id) =>
          p.programs.includes(id),
        );
        const genderText = perProgram
          ? " · gender per program"
          : p.gender === undefined
            ? ""
            : p.gender === "all"
              ? " · both genders"
              : ` · ${p.gender} only`;
        return `${g.key === OTHER_KEY ? "Other" : g.key}: ${progText}${semText}${genderText}`;
      })
      .join("  |  ");
  }

  function chip(
    key: string | number,
    label: string,
    on: boolean,
    onClick: () => void,
    title?: string,
  ) {
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={on}
        title={title}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          on
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background hover:bg-muted text-foreground",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {label}
      </button>
    );
  }

  const available = institutions.filter(
    (i) => !selectedInstitutions.includes(i.id),
  );

  return (
    <div className="space-y-5">
      {/* Step 1 — institutions (dropdown; picking one opens its section below) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Institutions
            {selectedInstitutions.length > 0 ? (
              <Badge variant="secondary" className="font-normal">
                {selectedInstitutions.length} selected
              </Badge>
            ) : null}
          </div>
        </div>

        {institutionsLoading ? (
          <Skeleton className="h-10 w-full sm:w-96" />
        ) : institutionsError ? (
          <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
            Could not load institutions: {institutionsError}
          </div>
        ) : institutions.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-3">
            No institutions are available to select.
          </div>
        ) : (
          <div className="space-y-1.5">
            <Select
              value=""
              onValueChange={addInstitution}
              disabled={disabled || available.length === 0}
            >
              <SelectTrigger className="w-full sm:w-96">
                <SelectValue
                  placeholder={
                    available.length === 0
                      ? "Every institution is already added"
                      : "Select an institution to add…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {available.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {available.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={addAllInstitutions}
              >
                Add all institutions ({available.length})
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Choosing an institution opens its programs and semesters below.
              Add as many as the drive needs. An institution with nothing
              ticked includes all of its programs and semesters.
            </p>
          </div>
        )}
      </div>

      {/* Step 2 — programs + semesters per institution, per degree block */}
      {selectedInstitutions.length > 0 ? (
        <div>
          <p className="text-sm font-medium flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            Programs &amp; semesters per institution
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Each block (UG, PG …) has its own programs, semesters and gender
            (Both / Male / Female — it follows &ldquo;Open to&rdquo; above until you
            change it). A ticked program gets its own Both / Male / Female switch
            next to it. Tick
            nothing to include every learner of the institution. Once a block
            has a tick, only ticked blocks are included; inside a block, no
            program ticked means all its programs and no semester ticked means
            all its semesters.
          </p>

          <div className="space-y-3">
            {selectedInstitutions.map((instId) => {
              const groups = groupsByInst.get(instId) ?? [];
              const picks = picksFor(instId);
              const anyOrders = Array.from(picks.values()).some(
                (p) => p.orders.length > 0,
              );
              const isOpen = openSections.has(instId);
              const loading = semLoading || progLoading;
              return (
                <div key={instId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 min-w-0 text-left"
                      onClick={() => setSectionOpen(instId, !isOpen)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {nameOf.get(instId) ?? instId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {summaryFor(instId)}
                        </p>
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      {picks.size > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          onClick={() =>
                            writeEntry(instId, {
                              institution_id: instId,
                              semester_orders: [],
                              program_ids: [],
                            })
                          }
                        >
                          Clear
                        </Button>
                      ) : null}
                      {selectedInstitutions.length > 1 && anyOrders ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => applyToAll(instId)}
                          title="Copy these UG / PG semesters to the same blocks of every other institution"
                        >
                          Apply to all
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeInstitution(instId)}
                        aria-label={`Remove ${nameOf.get(instId) ?? "institution"}`}
                        title="Remove institution"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {!isOpen ? null : loading ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-28 rounded-full" />
                      ))}
                    </div>
                  ) : semIsError || progIsError ? (
                    <p className="mt-3 text-xs text-destructive">
                      Could not load programs or semesters for this institution.
                    </p>
                  ) : groups.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No semesters are configured for this institution — all of
                      its learners will be included.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {groups.map((g) => {
                        const pick = picks.get(g.key);
                        const active = !!pick;
                        return (
                          <div
                            key={g.key}
                            className={cn(
                              "rounded-md border p-3",
                              active ? "border-primary/50 bg-primary/5" : "bg-muted/20",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-xs font-semibold flex items-center gap-1.5">
                                <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                                {g.label}
                              </p>
                              <div className="flex items-center gap-2">
                                <div
                                  className="inline-flex overflow-hidden rounded-md border"
                                  role="radiogroup"
                                  aria-label={`${g.label} — open to`}
                                >
                                  {GENDER_OPTIONS.map((opt) => {
                                    const on =
                                      (pick?.gender ?? driveGender) === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        disabled={disabled}
                                        onClick={() =>
                                          setGroupGender(instId, g.key, opt.value)
                                        }
                                        className={cn(
                                          "px-2.5 py-1 text-[11px] font-medium transition-colors",
                                          on
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-background hover:bg-muted text-foreground",
                                        )}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {active ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={disabled}
                                    onClick={() =>
                                      setGroupPick(instId, g.key, {
                                        programs: [],
                                        orders: [],
                                      })
                                    }
                                  >
                                    Clear
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium text-muted-foreground">
                                Programs
                              </p>
                              {g.programs.length > 1 ? (
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => toggleAllGroupPrograms(instId, g)}
                                  className="text-[11px] font-medium text-primary hover:underline"
                                >
                                  {g.programs.every((o) =>
                                    o.ids.some((id) => pick?.programs.includes(id)),
                                  )
                                    ? "Unselect all"
                                    : "Select all"}
                                </button>
                              ) : null}
                            </div>
                            {g.programs.length === 0 ? (
                              <p className="text-xs text-muted-foreground mb-2">
                                No active programs listed for this block.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {g.programs.map((opt) => {
                                  const on =
                                    !!pick &&
                                    opt.ids.some((id) => pick.programs.includes(id));
                                  const programChip = chip(
                                    opt.value,
                                    opt.label,
                                    on,
                                    () => toggleGroupProgram(instId, g.key, opt.ids),
                                  );
                                  if (!on) return programChip;
                                  // A ticked program carries its own Both / Male / Female.
                                  const blockGender = pick?.gender ?? driveGender;
                                  const own = opt.ids
                                    .map((id) => pick?.programGenders?.[id])
                                    .find((v) => v !== undefined);
                                  const current = own ?? blockGender;
                                  return (
                                    <span
                                      key={opt.value}
                                      className="inline-flex items-center gap-1"
                                    >
                                      {programChip}
                                      <span
                                        className="inline-flex overflow-hidden rounded-full border"
                                        role="radiogroup"
                                        aria-label={`${opt.label} — open to`}
                                      >
                                        {GENDER_OPTIONS.map((go) => (
                                          <button
                                            key={go.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={current === go.value}
                                            title={`${opt.label}: ${go.label}`}
                                            disabled={disabled}
                                            onClick={() =>
                                              setProgramGender(
                                                instId,
                                                g.key,
                                                opt.ids,
                                                go.value,
                                              )
                                            }
                                            className={cn(
                                              "px-2 py-1 text-[10px] font-semibold transition-colors",
                                              current === go.value
                                                ? own !== undefined
                                                  ? "bg-amber-500 text-white"
                                                  : "bg-primary/80 text-primary-foreground"
                                                : "bg-background hover:bg-muted text-muted-foreground",
                                            )}
                                          >
                                            {go.label}
                                          </button>
                                        ))}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {g.orders.length > 0 ? (
                              <>
                                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
                                  Semesters
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {g.orders.map((order) =>
                                    chip(
                                      order,
                                      `Sem ${order}`,
                                      !!pick && pick.orders.includes(order),
                                      () => toggleGroupOrder(instId, g.key, order),
                                      `${g.label} — Semester ${order}`,
                                    ),
                                  )}
                                </div>
                              </>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Institutions: 2 · Semesters: 5, 6" style one-liner for summaries. */
export function describeTargeting(
  targeting: CdcDriveInstitutionSemesters,
  institutionCount: number,
  /** Overrides the saved gender (the drive form passes its unsaved choice). */
  genderOverride?: CdcDriveTargetGender,
): string {
  const gender =
    genderOverride ??
    targeting.find((t) => t.gender === "male" || t.gender === "female")
      ?.gender ??
    "all";
  // A block may set its own gender; then no single value describes the drive.
  const effective = new Set<CdcDriveTargetGender>();
  targeting.forEach((t) => {
    const groups = t.degree_semesters ?? [];
    if (groups.length === 0) effective.add(gender);
    else
      groups.forEach((g) => {
        const own = Object.values(g.program_genders ?? {});
        own.forEach((v) => effective.add(v));
        // The block's own value still applies to programs without a choice.
        const targeted = g.program_ids.length > 0 ? g.program_ids : g.all_program_ids;
        if (own.length < targeted.length) effective.add(g.gender ?? gender);
      });
  });
  const single = effective.size === 1 ? Array.from(effective)[0] : null;
  const genderText =
    effective.size > 1
      ? " · gender set per program / block"
      : single && single !== "all"
        ? ` · ${single} only`
        : "";
  const orders = new Set<number>();
  targeting.forEach((t) => t.semester_orders.forEach((o) => orders.add(o)));
  const semText =
    orders.size === 0
      ? "all semesters"
      : `Semester ${Array.from(orders)
          .sort((a, b) => a - b)
          .join(", ")}`;
  // Degree-wise entries carry the WHOLE block in program_ids when no program
  // is ticked, so "selected programs" must come from the ticks themselves.
  const programTicked = targeting.some((t) =>
    t.degree_semesters?.length
      ? t.degree_semesters.some((g) => g.program_ids.length > 0)
      : (t.program_ids?.length ?? 0) > 0,
  );
  const blockKeys = Array.from(
    new Set(
      targeting.flatMap((t) => (t.degree_semesters ?? []).map((g) => g.key)),
    ),
  ).filter((k) => !k.startsWith("__"));
  const programText = programTicked
    ? "selected programs"
    : blockKeys.length > 0
      ? `all ${blockKeys.join(" + ")} programs`
      : "all programs";
  return `${institutionCount} institution${institutionCount === 1 ? "" : "s"} · ${programText} · ${semText}${genderText}`;
}
