'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { format, getDaysInMonth, getDay } from 'date-fns'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/use-auth'
import {
  useCalendarEvents,
  useCalendarDayEvents,
} from '@/hooks/campus-living/use-calendar-events'
import type { CalendarEvent, CalendarEventType } from '@/types/campus-living'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react'

// ── Color config per event type ──────────────────────────────────────────
const EVENT_COLORS: Record<CalendarEventType, { hex: string; bg: string; text: string; label: string }> = {
  pm_task:   { hex: '#8b5cf6', bg: 'bg-purple-100', text: 'text-purple-700', label: 'PM Task' },
  cleaning:  { hex: '#22c55e', bg: 'bg-green-100',  text: 'text-green-700',  label: 'Cleaning' },
  leave:     { hex: '#3b82f6', bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Leave' },
  lc_event:  { hex: '#f59e0b', bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'LC Event' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const ALL_LAYERS: CalendarEventType[] = ['pm_task', 'cleaning', 'leave', 'lc_event']

// ── Page ─────────────────────────────────────────────────────────────────
export default function ResidentCalendarPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeLayers, setActiveLayers] = useState<CalendarEventType[]>([...ALL_LAYERS])

  // Fetch month events & day detail
  const { data: events, isLoading } = useCalendarEvents(
    institutionId,
    currentMonth,
    currentYear,
    activeLayers,
  )
  const { data: dayEvents } = useCalendarDayEvents(
    institutionId,
    selectedDate || undefined,
    activeLayers,
  )

  // ── Month nav ────────────────────────────────────────────────────────
  function goToPrevMonth() {
    if (currentMonth === 1) {
      setCurrentMonth(12)
      setCurrentYear((y) => y - 1)
    } else {
      setCurrentMonth((m) => m - 1)
    }
    setSelectedDate(null)
  }

  function goToNextMonth() {
    if (currentMonth === 12) {
      setCurrentMonth(1)
      setCurrentYear((y) => y + 1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
    setSelectedDate(null)
  }

  function goToToday() {
    setCurrentMonth(today.getMonth() + 1)
    setCurrentYear(today.getFullYear())
    setSelectedDate(null)
  }

  // ── Layer toggle ─────────────────────────────────────────────────────
  function toggleLayer(layer: CalendarEventType) {
    setActiveLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    )
  }

  // ── Build events map keyed by "YYYY-MM-DD" ──────────────────────────
  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (!events) return map
    for (const ev of events) {
      const key = ev.date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return map
  }, [events])

  // ── Calendar grid cells ──────────────────────────────────────────────
  const { cells, todayStr } = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1)
    const startWeekday = getDay(firstDay) // 0=Sun
    const daysInMonth = getDaysInMonth(firstDay)

    const todayString = format(today, 'yyyy-MM-dd')
    const dayCells: Array<{ day: number; dateStr: string } | null> = []

    // Leading blanks
    for (let i = 0; i < startWeekday; i++) dayCells.push(null)

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = format(new Date(currentYear, currentMonth - 1, d), 'yyyy-MM-dd')
      dayCells.push({ day: d, dateStr })
    }

    return { cells: dayCells, todayStr: todayString }
  }, [currentMonth, currentYear, today])

  // ── Month label ──────────────────────────────────────────────────────
  const monthLabel = format(new Date(currentYear, currentMonth - 1), 'MMMM yyyy')

  return (
    <ContentLayout title="Resident Calendar">
      <div className="space-y-4">
        {/* ── Header bar ────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Month navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="min-w-[180px] text-center text-lg font-semibold">
                  {monthLabel}
                </h2>
                <Button variant="outline" size="icon" onClick={goToNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  <CalendarDays className="mr-1.5 h-4 w-4" />
                  Today
                </Button>
              </div>

              {/* Layer toggles */}
              <div className="flex flex-wrap items-center gap-4">
                {ALL_LAYERS.map((layer) => {
                  const cfg = EVENT_COLORS[layer]
                  return (
                    <label
                      key={layer}
                      className="flex cursor-pointer items-center gap-1.5 text-sm"
                    >
                      <Checkbox
                        checked={activeLayers.includes(layer)}
                        onCheckedChange={() => toggleLayer(layer)}
                      />
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cfg.hex }}
                      />
                      <span>{cfg.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Calendar grid ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-px">
                  {WEEKDAYS.map((wd) => (
                    <div
                      key={wd}
                      className="py-2 text-center text-xs font-medium text-muted-foreground"
                    >
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-px">
                  {cells.map((cell, idx) => {
                    if (!cell) {
                      return <div key={`blank-${idx}`} className="min-h-[80px]" />
                    }

                    const dayEvents = eventsMap.get(cell.dateStr) || []
                    const isToday = cell.dateStr === todayStr
                    const isSelected = cell.dateStr === selectedDate
                    const visibleDots = dayEvents.slice(0, 3)
                    const overflow = dayEvents.length - 3

                    return (
                      <button
                        key={cell.dateStr}
                        onClick={() =>
                          setSelectedDate(isSelected ? null : cell.dateStr)
                        }
                        className={`
                          min-h-[80px] rounded-md border p-1.5 text-left transition-colors
                          hover:bg-accent/50
                          ${isToday ? 'ring-2 ring-primary ring-offset-1' : 'border-border/50'}
                          ${isSelected ? 'bg-accent' : ''}
                        `}
                      >
                        <span
                          className={`text-sm font-medium ${
                            isToday ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {cell.day}
                        </span>

                        {visibleDots.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {visibleDots.map((ev) => (
                              <span
                                key={ev.id}
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: ev.color || EVENT_COLORS[ev.type]?.hex }}
                                title={ev.title}
                              />
                            ))}
                            {overflow > 0 && (
                              <span className="text-[10px] leading-none text-muted-foreground">
                                +{overflow}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Day detail panel ──────────────────────────────────────── */}
        {selectedDate && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">
                {format(new Date(selectedDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedDate(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!dayEvents || dayEvents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No events on this day.
                </p>
              ) : (
                dayEvents.map((ev) => {
                  const cfg = EVENT_COLORS[ev.type]
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      {/* Colored bar */}
                      <div
                        className="mt-0.5 h-10 w-1 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: ev.color || cfg?.hex }}
                      />

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{ev.title}</span>
                          <Badge
                            variant="secondary"
                            className={`${cfg?.bg || ''} ${cfg?.text || ''} text-[11px]`}
                          >
                            {cfg?.label || ev.type}
                          </Badge>
                        </div>

                        {ev.end_date && ev.end_date !== ev.date && (
                          <p className="text-xs text-muted-foreground">
                            Until{' '}
                            {format(
                              new Date(ev.end_date + 'T00:00:00'),
                              'MMM d, yyyy',
                            )}
                          </p>
                        )}
                      </div>

                      {ev.link && (
                        <Link
                          href={ev.link}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  )
}
