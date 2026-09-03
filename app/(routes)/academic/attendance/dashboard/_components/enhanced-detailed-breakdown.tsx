'use client';

import { useState } from 'react';
import {
  Building2,
  GraduationCap,
  Building,
  BookOpen,
  Calendar,
  CalendarClock,
  Users,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  PieChart,
  Table as TableIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from '@/components/ui/chart';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from 'recharts';
import { cn } from '@/lib/utils';
import type { AttendanceStats } from '@/types/attendance-dashboard';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';

interface EnhancedDetailedBreakdownProps {
  stats: AttendanceStats[];
  canViewAllInstitutions: boolean;
  isLoading?: boolean;
}

interface HierarchyLevel {
  id: string;
  name: string;
  total_students: number;
  present: number;
  absent: number;
  /** Learners with a status recorded for this date — the rate's denominator. */
  marked: number;
  /**
   * Learners who HAD a class scheduled today and still have no mark — the real
   * backlog. Rendered wherever the percentage is; never omitted.
   *
   * This is NOT `total_students - marked`. That older reading counted learners
   * whose section has no timetable slot today, i.e. people nobody could mark,
   * and made a department report 317 pending while its actual outstanding count
   * was 33. Those learners are in `no_class` instead.
   */
  unmarked: number;
  /** Learners with no timetable slot today. Cannot be marked; not a backlog. */
  no_class: number;
  attendance_percentage: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  level:
    | 'institution'
    | 'degree'
    | 'department'
    | 'program'
    | 'semester'
    | 'section'
    | 'timetable';
  /**
   * Timetable rows only — the validity window, shown beside the name so it is
   * obvious which schedule put this class on today.
   */
  start_date?: string | null;
  end_date?: string | null;
  /**
   * Section rows only. True when no timetable scheduled a markable period for
   * this section on the selected date, so its learners cannot be marked at all
   * and are not part of the pending backlog.
   */
  no_class_today?: boolean;
  /** Learners who have no section yet — shown as "Not yet placed". */
  is_unplaced?: boolean;
  /** A college with no learners once this view's narrowing is applied. */
  is_empty_view?: boolean;
  children?: HierarchyLevel[];
}

/**
 * Wording for the two cases that used to be silent.
 *
 * NOT_YET_PLACED_LABEL replaces the bare "Unknown Section" a learner with no
 * section_id used to render as; EMPTY_VIEW_REASON is what a college shows
 * instead of disappearing from the list altogether.
 */
const NOT_YET_PLACED_LABEL = 'Not yet placed';
const NOT_YET_PLACED_REASON =
  'These learners have no section yet, so attendance cannot be recorded for them until one is assigned.';
const EMPTY_VIEW_REASON =
  'No learners admitted in this intake yet — nothing to record attendance for.';

/**
 * The unmarked count, phrased for a card.
 *
 * Kept as one function so a percentage can never be rendered in this file
 * without it: a college that marked 1 learner of 93 reads as "100%" unless the
 * 92 are said out loud (Director decision 2026-08-11).
 */
function unmarkedNote(unmarked: number, marked: number): string {
  if (unmarked <= 0) return `all ${marked} marked`;
  if (marked <= 0) return `${unmarked} not yet marked — nobody marked yet`;
  return `${marked} marked · ${unmarked} not yet marked`;
}

/**
 * A timetable's validity window, phrased for a subtitle.
 *
 * Sliced rather than date-formatted: these arrive as plain ISO `date` strings
 * (no time component), and `new Date('2026-07-01')` is UTC midnight — at a
 * negative UTC offset that renders as the previous day, which is exactly the
 * off-by-one this codebase has hit before with all-day dates.
 */
function formatWindow(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'no end date';
  if (!start) return `until ${String(end).slice(0, 10)}`;
  if (!end) return `from ${String(start).slice(0, 10)}`;
  return `${String(start).slice(0, 10)} → ${String(end).slice(0, 10)}`;
}

/**
 * Split a level's headcount into "really pending" and "no class today".
 *
 * Applied at EVERY level, not just sections: the cards were switched to the
 * scheduled arithmetic while this breakdown still showed `total - marked`, so
 * the header read "Not yet marked 0" above a table claiming 317 for the same
 * department. One helper, used by both the tree and the table, so they cannot
 * drift apart again.
 *
 * `legacyUnmarked` is returned unchanged when the RPC did not emit the
 * scheduling columns (`has_scheduling` false). Without that branch every level
 * would read "0 pending, everyone has no class" against an un-migrated
 * database — the most misleading state this screen can show.
 */
function splitUnmarked(
  hasScheduling: boolean,
  total: number,
  scheduled: number,
  scheduledMarked: number,
  legacyUnmarked: number
): { unmarked: number; no_class: number } {
  if (!hasScheduling) return { unmarked: legacyUnmarked, no_class: 0 };
  return {
    unmarked: Math.max(scheduled - scheduledMarked, 0),
    no_class: Math.max(total - scheduled, 0)
  };
}

/** Section rows whose learners have no scheduled class on the selected date. */
const NO_CLASS_TODAY_REASON =
  'No timetable scheduled a period for this section today, so these learners cannot be marked. They are not part of the pending count.';

const LEVEL_COLORS = {
  institution: 'hsl(var(--primary))',
  degree: 'hsl(var(--secondary))',
  department: 'hsl(var(--accent))',
  program: 'hsl(var(--muted))',
  semester: 'hsl(var(--destructive))',
  section: 'hsl(var(--success))',
  timetable: 'hsl(var(--primary))'
};

const LEVEL_ICONS = {
  institution: Building2,
  degree: GraduationCap,
  department: Building,
  program: BookOpen,
  semester: Calendar,
  section: Users,
  timetable: CalendarClock
};

const ATTENDANCE_COLORS = {
  excellent: '#10b981', // green-500
  good: '#3b82f6', // blue-500
  fair: '#f59e0b', // amber-500
  poor: '#ef4444' // red-500
};

function getAttendanceColor(percentage: number): string {
  if (percentage >= 90) return ATTENDANCE_COLORS.excellent;
  if (percentage >= 75) return ATTENDANCE_COLORS.good;
  if (percentage >= 60) return ATTENDANCE_COLORS.fair;
  return ATTENDANCE_COLORS.poor;
}

function getAttendanceGrade(percentage: number): {
  grade: string;
  color: string;
} {
  if (percentage >= 90)
    return {
      grade: 'Excellent',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    };
  if (percentage >= 75)
    return {
      grade: 'Good',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
    };
  if (percentage >= 60)
    return {
      grade: 'Fair',
      color:
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
    };
  return {
    grade: 'Poor',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
  };
}

function AttendanceChart({
  data,
  type = 'pie'
}: {
  data: { name: string; value: number; color: string }[];
  type?: 'pie' | 'bar';
}) {
  const chartConfig = data.reduce((config, item, index) => {
    config[item.name.toLowerCase()] = {
      label: item.name,
      color: item.color
    };
    return config;
  }, {} as any);

  if (type === 'pie') {
    return (
      <ChartContainer config={chartConfig} className='h-[200px] w-full'>
        <RechartsPieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie
            data={data}
            cx='50%'
            cy='50%'
            outerRadius={60}
            dataKey='value'
            label={({ name, percent }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent />} />
        </RechartsPieChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={chartConfig} className='h-[200px] w-full'>
      <BarChart data={data}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <XAxis dataKey='name' />
        <YAxis />
        <Bar dataKey='value' fill='var(--color-primary)' />
      </BarChart>
    </ChartContainer>
  );
}

function HierarchyCard({
  item,
  level,
  isExpanded,
  onToggle,
  showChart = false
}: {
  item: HierarchyLevel;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  showChart?: boolean;
}) {
  const Icon = item.icon;
  const { grade, color: gradeColor } = getAttendanceGrade(
    item.attendance_percentage
  );
  const hasChildren = item.children && item.children.length > 0;

  // Chart data for this item. "Not yet marked" is a slice, not an omission --
  // a pie of Present vs Absent over a mostly-unmarked cohort reads as a
  // complete picture of a cohort nobody has looked at.
  const chartData = [
    {
      name: 'Present',
      value: item.present,
      color: ATTENDANCE_COLORS.excellent
    },
    { name: 'Absent', value: item.absent, color: ATTENDANCE_COLORS.poor },
    {
      name: 'Not yet marked',
      value: item.unmarked,
      color: ATTENDANCE_COLORS.fair
    },
    // Kept as its own slice rather than folded into "Not yet marked". Merging
    // them is what made the pie imply a marking failure over learners who had
    // no class at all; dropping it instead would leave the pie summing to less
    // than the headcount with no explanation for the gap.
    {
      name: 'No class today',
      value: item.no_class,
      color: 'hsl(var(--muted-foreground))'
    }
  ].filter((slice) => slice.value > 0);

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        level > 0 && 'ml-6 border-l-4'
      )}
      style={{ borderLeftColor: level > 0 ? item.color : undefined }}
    >
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-3 min-w-0 flex-1'>
            {hasChildren && (
              <Button
                variant='ghost'
                size='sm'
                className='h-8 w-8 p-0'
                onClick={onToggle}
              >
                {isExpanded ? (
                  <ChevronDown className='h-4 w-4' />
                ) : (
                  <ChevronRight className='h-4 w-4' />
                )}
              </Button>
            )}
            <div
              className={cn(
                'p-2 rounded-lg',
                level === 0 ? 'bg-primary/10' : 'bg-muted'
              )}
              style={{ color: item.color } as React.CSSProperties}
            >
              <Icon className='h-5 w-5' />
            </div>
            <div className='min-w-0'>
              <CardTitle className='text-lg font-semibold truncate'>
                {item.is_unplaced ? NOT_YET_PLACED_LABEL : item.name}
              </CardTitle>
              <p className='text-sm text-muted-foreground capitalize truncate'>
                {item.level} • {item.total_students} learners
                {/* Not capitalised by the parent class because it is a date
                    range, not a label — rendered inline so the window that makes
                    this timetable "today's" is visible without expanding it. */}
                {item.level === 'timetable' && (
                  <span className='normal-case'>
                    {' • '}
                    {formatWindow(item.start_date, item.end_date)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className='flex items-center gap-3 shrink-0'>
            {/* No grade and no percentage when nobody has been marked: a rate
                over zero marked learners is not a low score, it is no reading
                at all. */}
            {item.marked > 0 ? (
              <>
                <Badge className={gradeColor}>{grade}</Badge>
                <div className='text-right'>
                  <div className='text-2xl font-bold'>
                    {item.attendance_percentage}%
                  </div>
                  {/* The denominator, always. Never "Attendance" alone. */}
                  <div className='text-sm text-muted-foreground'>
                    of {item.marked} marked
                  </div>
                </div>
              </>
            ) : (
              <div className='text-right'>
                <div className='text-2xl font-bold text-muted-foreground'>—</div>
                {/* "Not yet marked" here would be a false accusation: with no
                    period scheduled there is nothing for anyone to mark. */}
                <div className='text-sm text-muted-foreground'>
                  {item.no_class_today ? 'No class today' : 'Not yet marked'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reasons, so neither case reads as an unexplained blank */}
        {item.is_empty_view && (
          <p className='text-xs text-muted-foreground'>{EMPTY_VIEW_REASON}</p>
        )}
        {item.no_class_today && !item.is_unplaced && (
          <p className='text-xs text-muted-foreground'>
            {NO_CLASS_TODAY_REASON}
          </p>
        )}
        {item.is_unplaced && (
          <p className='text-xs text-muted-foreground'>
            {NOT_YET_PLACED_REASON}
          </p>
        )}

        {/* Progress Bar */}
        <div className='space-y-2'>
          <Progress
            value={item.marked > 0 ? item.attendance_percentage : 0}
            className='h-2'
            style={
              {
                '--progress-background': getAttendanceColor(
                  item.attendance_percentage
                )
              } as React.CSSProperties
            }
          />
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>{item.present} Present</span>
            <span>{item.absent} Absent</span>
            <span>{item.unmarked} not yet marked</span>
            {item.no_class > 0 && <span>{item.no_class} no class today</span>}
          </div>
        </div>
      </CardHeader>

      {/* Detailed Stats */}
      <CardContent className='pt-0'>
        <div className='grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4'>
          <div className='text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg'>
            <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
              {item.present}
            </div>
            <div className='text-xs text-green-600/70 dark:text-green-400/70'>
              Present
            </div>
          </div>
          <div className='text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg'>
            <div className='text-2xl font-bold text-red-600 dark:text-red-400'>
              {item.absent}
            </div>
            <div className='text-xs text-red-600/70 dark:text-red-400/70'>
              Absent
            </div>
          </div>
          {/* The backlog, given the same weight as present and absent. This is
              the number the percentage used to hide. */}
          <div className='text-center p-3 bg-amber-50 dark:bg-amber-950 rounded-lg'>
            <div className='text-2xl font-bold text-amber-600 dark:text-amber-400'>
              {item.unmarked}
            </div>
            <div className='text-xs text-amber-600/70 dark:text-amber-400/70'>
              Not yet marked
            </div>
            {/* Stated on the same tile so the two can never be read apart: this
                tile is a work queue, and the figure beside it is explicitly not
                part of that queue. */}
            {item.no_class > 0 && (
              <div className='text-[10px] text-muted-foreground mt-0.5'>
                +{item.no_class} no class today
              </div>
            )}
          </div>
          <div className='text-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg'>
            <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
              {item.total_students}
            </div>
            <div className='text-xs text-blue-600/70 dark:text-blue-400/70'>
              Total
            </div>
          </div>
        </div>

        {/* Chart for top-level items */}
        {showChart && item.total_students > 0 && (
          <div className='mt-4'>
            <div className='flex items-center justify-between mb-2'>
              <h4 className='text-sm font-medium'>Attendance Distribution</h4>
              <div className='flex gap-1'>
                <PieChart className='h-4 w-4 text-muted-foreground' />
              </div>
            </div>
            <AttendanceChart data={chartData} type='pie' />
          </div>
        )}

        {/* Trend Indicator */}
        <div className='flex items-center justify-center gap-2 mt-3 pt-3 border-t'>
          {item.attendance_percentage >= 75 ? (
            <TrendingUp className='h-4 w-4 text-green-500' />
          ) : item.attendance_percentage >= 60 ? (
            <Minus className='h-4 w-4 text-yellow-500' />
          ) : (
            <TrendingDown className='h-4 w-4 text-red-500' />
          )}
          <span className='text-xs text-muted-foreground'>
            {item.attendance_percentage >= 75
              ? 'Good attendance'
              : item.attendance_percentage >= 60
              ? 'Average attendance'
              : 'Needs attention'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function HierarchyTree({
  items,
  level = 0
}: {
  items: HierarchyLevel[];
  level?: number;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <div className='space-y-4'>
      {items.map((item) => (
        <div key={item.id}>
          <HierarchyCard
            item={item}
            level={level}
            isExpanded={expandedItems.has(item.id)}
            onToggle={() => toggleExpanded(item.id)}
            showChart={level === 0} // Show charts only for top-level (institutions)
          />

          {expandedItems.has(item.id) && item.children && (
            <Collapsible open={true}>
              <CollapsibleContent>
                <div className='mt-4'>
                  <HierarchyTree items={item.children} level={level + 1} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ))}
    </div>
  );
}

// Transform the stats data into hierarchical structure
function transformStatsToHierarchy(stats: AttendanceStats[]): HierarchyLevel[] {
  const hierarchy: HierarchyLevel[] = [];

  if (!stats || stats.length === 0) {
    return hierarchy;
  }

  stats.forEach((institution) => {
    // One flag per college, read from the RPC's own output — see splitUnmarked.
    const hasSched = institution.has_scheduling === true;

    const institutionSplit = splitUnmarked(
      hasSched,
      institution.total_students,
      institution.total_scheduled,
      institution.total_scheduled_marked,
      institution.total_unmarked
    );

    const institutionNode: HierarchyLevel = {
      id: institution.institution_id,
      name: institution.institution_name,
      total_students: institution.total_students,
      present: institution.total_present,
      absent: institution.total_absent,
      marked: institution.total_marked,
      unmarked: institutionSplit.unmarked,
      no_class: institutionSplit.no_class,
      attendance_percentage: institution.attendance_percentage,
      icon: LEVEL_ICONS.institution,
      color: LEVEL_COLORS.institution,
      level: 'institution',
      is_empty_view: institution.is_empty_view,
      no_class_today: hasSched && institution.total_scheduled === 0 && institution.total_students > 0,
      children: []
    };

    // Add departments directly to institution (current data structure: Institution → Department → Semester → Section)
    if (institution.departments) {
      institution.departments.forEach((department) => {
        const departmentSplit = splitUnmarked(
          hasSched,
          department.total_students,
          department.total_scheduled,
          department.total_scheduled_marked,
          department.total_unmarked
        );

        const departmentNode: HierarchyLevel = {
          id: `${institution.institution_id}-${department.department_id}`,
          name: department.department_name,
          total_students: department.total_students,
          present: department.total_present,
          absent: department.total_absent,
          marked: department.total_marked,
          unmarked: departmentSplit.unmarked,
          no_class: departmentSplit.no_class,
          attendance_percentage: department.attendance_percentage,
          icon: LEVEL_ICONS.department,
          color: LEVEL_COLORS.department,
          level: 'department',
          no_class_today:
            hasSched &&
            department.total_scheduled === 0 &&
            department.total_students > 0,
          children: []
        };

        // Add semesters
        if (department.semesters) {
          department.semesters.forEach((semester) => {
            const semesterSplit = splitUnmarked(
              hasSched,
              semester.total_students,
              semester.total_scheduled,
              semester.total_scheduled_marked,
              semester.total_unmarked
            );

            const semesterNode: HierarchyLevel = {
              id: `${institution.institution_id}-${department.department_id}-${semester.semester_id}`,
              name: semester.semester_name,
              total_students: semester.total_students,
              present: semester.total_present,
              absent: semester.total_absent,
              marked: semester.total_marked,
              unmarked: semesterSplit.unmarked,
              no_class: semesterSplit.no_class,
              attendance_percentage: semester.attendance_percentage,
              icon: LEVEL_ICONS.semester,
              color: LEVEL_COLORS.semester,
              level: 'semester',
              no_class_today:
                hasSched &&
                semester.total_scheduled === 0 &&
                semester.total_students > 0,
              children: []
            };

            // Add sections
            if (semester.sections) {
              semester.sections.forEach((section) => {
                const sectionSplit = splitUnmarked(
                  hasSched,
                  section.total_students,
                  section.scheduled,
                  section.scheduled_marked,
                  section.unmarked
                );

                const sectionNode: HierarchyLevel = {
                  id: `${institution.institution_id}-${department.department_id}-${semester.semester_id}-${section.section_id}`,
                  name: section.is_unplaced
                    ? NOT_YET_PLACED_LABEL
                    : section.section_name,
                  total_students: section.total_students,
                  present: section.present,
                  absent: section.absent,
                  marked: section.marked,
                  unmarked: sectionSplit.unmarked,
                  no_class: sectionSplit.no_class,
                  attendance_percentage: section.percentage, // Note: sections use 'percentage' not 'attendance_percentage'
                  icon: LEVEL_ICONS.section,
                  color: LEVEL_COLORS.section,
                  level: 'section',
                  is_unplaced: section.is_unplaced,
                  // Empty exactly when nothing scheduled this section today. The
                  // row then reads "No class today" instead of an unmarked count
                  // nobody can act on — that conflation is what made Dental report
                  // 357 pending against a true backlog of 0.
                  no_class_today:
                    hasSched && (section.timetables?.length ?? 0) === 0,
                  children: (section.timetables ?? []).map((tt) => ({
                    id: `${institution.institution_id}-${department.department_id}-${semester.semester_id}-${section.section_id}-${tt.id}`,
                    name: tt.name,
                    // A timetable schedules the WHOLE section, so it inherits the
                    // section's counts rather than splitting them. Two timetables
                    // covering one section would each show the same learners —
                    // attributing an unmarked learner to one of them would be
                    // invention, so the row states the schedule, not a share.
                    total_students: section.total_students,
                    present: section.present,
                    absent: section.absent,
                    marked: section.marked,
                    unmarked: sectionSplit.unmarked,
                    // A timetable row exists only because this section HAS a
                    // class today, so it can never carry a "no class" count.
                    no_class: 0,
                    attendance_percentage: section.percentage,
                    icon: LEVEL_ICONS.timetable,
                    color: LEVEL_COLORS.timetable,
                    level: 'timetable' as const,
                    start_date: tt.start_date,
                    end_date: tt.end_date
                  }))
                };

                semesterNode.children!.push(sectionNode);
              });
            }

            departmentNode.children!.push(semesterNode);
          });
        }

        institutionNode.children!.push(departmentNode);
      });
    }

    hierarchy.push(institutionNode);
  });

  return hierarchy;
}

// Expandable table row interface
interface ExpandableTableRow {
  id: string;
  name: string;
  total_students: number;
  present: number;
  absent: number;
  marked: number;
  /** Scheduled today and still unmarked — the actionable backlog. */
  unmarked: number;
  /** No timetable slot today. Cannot be marked; deliberately a separate column. */
  no_class: number;
  attendance_percentage: number;
  level: 'department' | 'semester' | 'section';
  is_unplaced?: boolean;
  /** True when NOTHING is scheduled for this row today. */
  no_class_today?: boolean;
  children?: ExpandableTableRow[];
  parentId?: string;
}

// Transform hierarchy into expandable table structure
function transformToExpandableTableRows(
  hierarchy: HierarchyLevel[]
): ExpandableTableRow[] {
  const rows: ExpandableTableRow[] = [];

  hierarchy.forEach((institution) => {
    institution.children?.forEach((department) => {
      const departmentRow: ExpandableTableRow = {
        id: `dept-${department.id}`,
        name: department.name,
        total_students: department.total_students,
        present: department.present,
        absent: department.absent,
        marked: department.marked,
        unmarked: department.unmarked,
        no_class: department.no_class,
        attendance_percentage: department.attendance_percentage,
        no_class_today: department.no_class_today,
        level: 'department',
        children: []
      };

      // Add semesters as children
      department.children?.forEach((semester) => {
        const semesterRow: ExpandableTableRow = {
          id: `sem-${semester.id}`,
          name: semester.name,
          total_students: semester.total_students,
          present: semester.present,
          absent: semester.absent,
          marked: semester.marked,
          unmarked: semester.unmarked,
          no_class: semester.no_class,
          attendance_percentage: semester.attendance_percentage,
          no_class_today: semester.no_class_today,
          level: 'semester',
          parentId: departmentRow.id,
          children: []
        };

        // Add sections as children of semester
        semester.children?.forEach((section) => {
          const sectionRow: ExpandableTableRow = {
            id: `sec-${section.id}`,
            name: section.name,
            total_students: section.total_students,
            present: section.present,
            absent: section.absent,
            marked: section.marked,
            unmarked: section.unmarked,
            no_class: section.no_class,
            attendance_percentage: section.attendance_percentage,
            no_class_today: section.no_class_today,
            level: 'section',
            is_unplaced: section.is_unplaced,
            parentId: semesterRow.id
          };

          semesterRow.children!.push(sectionRow);
        });

        departmentRow.children!.push(semesterRow);
      });

      rows.push(departmentRow);
    });
  });

  return rows;
}

// Expandable table component for detailed breakdown
function ExpandableDetailedBreakdownTable({
  data
}: {
  data: ExpandableTableRow[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'students' | 'attendance'>(
    'name'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const label = useAdaptiveLabels();

  // Toggle row expansion
  const toggleRowExpansion = (rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
      // Also collapse all children
      const collapseChildren = (
        rows: ExpandableTableRow[],
        parentId: string
      ) => {
        rows.forEach((row) => {
          if (row.parentId === parentId || expandedRows.has(row.id)) {
            newExpanded.delete(row.id);
            if (row.children) {
              collapseChildren(row.children, row.id);
            }
          }
        });
      };
      const parentRow = findRowById(data, rowId);
      if (parentRow?.children) {
        collapseChildren(parentRow.children, rowId);
      }
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  };

  // Find row by ID recursively
  const findRowById = (
    rows: ExpandableTableRow[],
    id: string
  ): ExpandableTableRow | null => {
    for (const row of rows) {
      if (row.id === id) return row;
      if (row.children) {
        const found = findRowById(row.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // Flatten rows for display based on expansion state
  const flattenRowsForDisplay = (
    rows: ExpandableTableRow[],
    level: number = 0
  ): Array<ExpandableTableRow & { displayLevel: number }> => {
    const result: Array<ExpandableTableRow & { displayLevel: number }> = [];

    rows.forEach((row) => {
      // Apply search filter
      const matchesSearch =
        !searchTerm ||
        row.name.toLowerCase().includes(searchTerm.toLowerCase());

      if (matchesSearch) {
        result.push({ ...row, displayLevel: level });

        // Add children if expanded
        if (expandedRows.has(row.id) && row.children) {
          result.push(...flattenRowsForDisplay(row.children, level + 1));
        }
      }
    });

    return result;
  };

  // Sort the top-level data
  const sortedData = [...data].sort((a, b) => {
    let aValue, bValue;

    switch (sortBy) {
      case 'students':
        aValue = a.total_students;
        bValue = b.total_students;
        break;
      case 'attendance':
        aValue = a.attendance_percentage;
        bValue = b.attendance_percentage;
        break;
      default:
        aValue = a.name;
        bValue = b.name;
    }

    if (sortOrder === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  const displayRows = flattenRowsForDisplay(sortedData);

  const getRowClassName = (
    row: ExpandableTableRow & { displayLevel: number }
  ) => {
    if (row.level === 'department') {
      return 'bg-blue-50 dark:bg-blue-950 font-semibold border-l-4 border-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900';
    }
    if (row.level === 'semester') {
      return 'bg-green-50 dark:bg-green-950 font-medium border-l-4 border-green-500 hover:bg-green-100 dark:hover:bg-green-900';
    }
    return 'hover:bg-muted/50 border-l-4 border-gray-200 dark:border-gray-700';
  };

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90)
      return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300';
    if (percentage >= 75)
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300';
    if (percentage >= 60)
      return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300';
    return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300';
  };

  const getIcon = (level: string) => {
    switch (level) {
      case 'department':
        return Building;
      case 'semester':
        return Calendar;
      case 'section':
        return Users;
      default:
        return Building;
    }
  };

  return (
    <div className='space-y-4'>
      {/* Table Controls */}
      <div className='flex flex-col sm:flex-row gap-4 items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <Input
              type='text'
              placeholder={`Search ${label('departments')}, ${label('semesters')}, sections...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='pl-8 w-80'
            />
            <div className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground'>
              🔍
            </div>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setExpandedRows(new Set())}
            className='ml-2'
          >
            Collapse All
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              const allIds = new Set<string>();
              const collectIds = (rows: ExpandableTableRow[]) => {
                rows.forEach((row) => {
                  if (row.children && row.children.length > 0) {
                    allIds.add(row.id);
                    collectIds(row.children);
                  }
                });
              };
              collectIds(data);
              setExpandedRows(allIds);
            }}
          >
            Expand All
          </Button>
        </div>

        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>Sort by:</span>
          <Select
            value={sortBy}
            onValueChange={(value) =>
              setSortBy(value as 'name' | 'students' | 'attendance')
            }
          >
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='name'>Name</SelectItem>
              <SelectItem value='students'>Students</SelectItem>
              <SelectItem value='attendance'>Attendance %</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className='p-1 h-auto'
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Results count */}
      <div className='text-sm text-muted-foreground'>
        Showing {displayRows.length} records
      </div>

      {/* Table */}
      <div className='rounded-md border overflow-hidden'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/50'>
              <TableHead className='font-semibold w-96'>Name</TableHead>
              <TableHead className='font-semibold text-right'>
                Total Learners
              </TableHead>
              <TableHead className='font-semibold text-right'>
                Present
              </TableHead>
              <TableHead className='font-semibold text-right'>Absent</TableHead>
              {/* Sits immediately before the percentage on purpose: the rate is
                  present ÷ marked, so this column is its missing context. */}
              <TableHead className='font-semibold text-right'>
                Not yet marked
              </TableHead>
              {/* Ships beside "Not yet marked", never instead of it. Together the
                  two account for every learner the row counts, which is what
                  makes the backlog number safe to act on: before this column
                  existed, Dentistry (UG) reported 317 pending when 284 of those
                  learners had no class scheduled at all. */}
              <TableHead className='font-semibold text-right'>
                No class today
              </TableHead>
              <TableHead className='font-semibold text-right'>
                Attendance % (of marked)
              </TableHead>
              <TableHead className='font-semibold text-center'>
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((row) => {
              const Icon = getIcon(row.level);
              const hasChildren = row.children && row.children.length > 0;
              const isExpanded = expandedRows.has(row.id);

              return (
                <TableRow key={row.id} className={getRowClassName(row)}>
                  <TableCell className='font-medium'>
                    <div
                      className='flex items-center gap-2 cursor-pointer'
                      style={{ paddingLeft: `${row.displayLevel * 20}px` }}
                      onClick={() => hasChildren && toggleRowExpansion(row.id)}
                    >
                      {hasChildren && (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='p-0 h-auto w-4'
                        >
                          {isExpanded ? (
                            <ChevronDown className='h-4 w-4' />
                          ) : (
                            <ChevronRight className='h-4 w-4' />
                          )}
                        </Button>
                      )}
                      {!hasChildren && <div className='w-4' />}
                      <Icon className='h-4 w-4' />
                      <span className={hasChildren ? 'hover:underline' : ''}>
                        {row.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='text-right font-medium'>
                    {row.total_students}
                  </TableCell>
                  <TableCell className='text-right'>
                    <span className='text-green-600 font-medium'>
                      {row.present}
                    </span>
                  </TableCell>
                  <TableCell className='text-right'>
                    <span className='text-red-600 font-medium'>
                      {row.absent}
                    </span>
                  </TableCell>
                  <TableCell className='text-right'>
                    {/* Amber only when there is something to chase. A zero here
                        is a finished queue, not a warning. */}
                    <span
                      className={cn(
                        'font-medium',
                        row.unmarked > 0
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {row.unmarked}
                    </span>
                  </TableCell>
                  {/* Muted, never amber: nobody can act on these. */}
                  <TableCell className='text-right'>
                    <span className='text-muted-foreground'>
                      {row.no_class > 0 ? row.no_class : '—'}
                    </span>
                  </TableCell>
                  <TableCell className='text-right'>
                    {/* A rate over zero marked learners is not 0% -- it is no
                        reading. Show a dash, not a grade nobody earned. */}
                    {row.marked > 0 ? (
                      <span className='font-semibold'>
                        {row.attendance_percentage}%
                        <span className='text-muted-foreground font-normal'>
                          {' '}
                          of {row.marked}
                        </span>
                      </span>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='text-center'>
                    {row.marked > 0 ? (
                      <Badge
                        variant='secondary'
                        className={cn(
                          'text-xs',
                          getAttendanceColor(row.attendance_percentage)
                        )}
                      >
                        {row.attendance_percentage >= 90
                          ? 'Excellent'
                          : row.attendance_percentage >= 75
                          ? 'Good'
                          : row.attendance_percentage >= 60
                          ? 'Fair'
                          : 'Poor'}
                      </Badge>
                    ) : row.no_class_today ? (
                      /* Nothing is scheduled for this row today, so "Not yet
                         marked" would blame staff for work that does not exist.
                         This is the badge the screenshots showed on section "C"
                         and "ADD CRRI A", each holding one learner with no class. */
                      <Badge
                        variant='outline'
                        className='text-xs text-muted-foreground'
                      >
                        No class today
                      </Badge>
                    ) : (
                      <Badge variant='outline' className='text-xs'>
                        Not yet marked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EnhancedDetailedBreakdown({
  stats,
  canViewAllInstitutions,
  isLoading = false
}: EnhancedDetailedBreakdownProps) {
  const label = useAdaptiveLabels();
  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className='p-6'>
            <div className='space-y-4'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 bg-muted rounded-lg animate-pulse' />
                <div className='space-y-2'>
                  <div className='h-5 w-48 bg-muted rounded animate-pulse' />
                  <div className='h-4 w-32 bg-muted rounded animate-pulse' />
                </div>
              </div>
              <div className='h-2 w-full bg-muted rounded animate-pulse' />
              <div className='grid grid-cols-3 gap-4'>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className='h-16 bg-muted rounded animate-pulse'
                  />
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <Card className='p-8 text-center'>
        <BarChart3 className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
        <h3 className='text-lg font-semibold mb-2'>No Data Available</h3>
        <p className='text-muted-foreground'>
          No attendance statistics found for the selected criteria.
        </p>
      </Card>
    );
  }

  const hierarchyData = transformStatsToHierarchy(stats);
  const isSingleInstitution = stats.length === 1;

  return (
    <div className='space-y-6'>
      {/* Summary Overview */}
      <Card className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <BarChart3 className='h-5 w-5 text-blue-600' />
            Attendance Overview
            {isSingleInstitution && (
              <Badge variant='outline' className='ml-2'>
                {stats[0].institution_name}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            <div className='text-center'>
              <div className='text-2xl font-bold text-blue-600'>
                {isSingleInstitution
                  ? stats[0].departments?.length || 0
                  : stats.length}
              </div>
              <div className='text-sm text-muted-foreground'>
                {isSingleInstitution
                  ? label('Departments')
                  : canViewAllInstitutions
                  ? 'Institutions'
                  : label('Departments')}
              </div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-green-600'>
                {stats.reduce((sum, stat) => sum + stat.total_students, 0)}
              </div>
              <div className='text-sm text-muted-foreground'>
                Total Students
              </div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-emerald-600'>
                {stats.reduce((sum, stat) => sum + stat.total_present, 0)}
              </div>
              <div className='text-sm text-muted-foreground'>Present</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-red-600'>
                {stats.reduce((sum, stat) => sum + stat.total_absent, 0)}
              </div>
              <div className='text-sm text-muted-foreground'>Absent</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      <div>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h3 className='text-xl font-semibold'>Detailed Breakdown</h3>
            <p className='text-sm text-muted-foreground mt-1'>
              {isSingleInstitution
                ? `${label('Department')} → ${label('Semester')} → ${label('Section')} breakdown with detailed attendance analytics`
                : `Institution → ${label('Department')} → ${label('Semester')} → ${label('Section')} hierarchy`}
            </p>
          </div>
          {isSingleInstitution && (
            <Badge variant='secondary' className='flex items-center gap-1'>
              <TableIcon className='h-3 w-3' />
              Table View
            </Badge>
          )}
        </div>

        {isSingleInstitution ? (
          <ExpandableDetailedBreakdownTable
            data={transformToExpandableTableRows(hierarchyData)}
          />
        ) : (
          <HierarchyTree items={hierarchyData} />
        )}
      </div>
    </div>
  );
}
