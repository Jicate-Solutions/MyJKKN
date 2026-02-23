'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, CalendarDays, Megaphone, BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useCommunityConfig, useUpdateCommunityConfig } from '@/hooks/campus-living/use-community'

export default function CommunitySettingsPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: config, isLoading } = useCommunityConfig(institutionId)
  const updateConfig = useUpdateCommunityConfig(institutionId)

  // Local state mirrors config for immediate UI feedback
  const [showEvents, setShowEvents] = useState(true)
  const [showAnnouncements, setShowAnnouncements] = useState(true)
  const [showPolls, setShowPolls] = useState(true)
  const [maxEvents, setMaxEvents] = useState(10)
  const [maxAnnouncements, setMaxAnnouncements] = useState(5)
  const [maxPolls, setMaxPolls] = useState(3)

  // Sync local state when config loads
  useEffect(() => {
    if (config) {
      setShowEvents(config.show_lc_events)
      setShowAnnouncements(config.show_lc_announcements)
      setShowPolls(config.show_lc_polls)
      setMaxEvents(config.max_events_shown)
      setMaxAnnouncements(config.max_announcements_shown)
      setMaxPolls(config.max_polls_shown)
    }
  }, [config])

  // Clamp a number to a valid range (guards against NaN / 0 from cleared inputs)
  function clamp(val: number, min: number, max: number) {
    if (Number.isNaN(val) || val < min) return min
    if (val > max) return max
    return Math.floor(val)
  }

  function handleSave() {
    updateConfig.mutate({
      show_lc_events: showEvents,
      show_lc_announcements: showAnnouncements,
      show_lc_polls: showPolls,
      max_events_shown: clamp(maxEvents, 1, 50),
      max_announcements_shown: clamp(maxAnnouncements, 1, 20),
      max_polls_shown: clamp(maxPolls, 1, 10),
    })
  }

  if (isLoading) {
    return (
      <ContentLayout title="Community Settings">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Community Settings">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/campus-living/community">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Community Settings</h1>
              <p className="text-muted-foreground">
                Manage Learners Council content in the Community Hub
              </p>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Community Hub Configuration</CardTitle>
            <CardDescription>
              Control what Learners Council content appears in the Campus Living community page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Events Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <CalendarDays className="h-4 w-4" />
                Events
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show-events">Show LC Events</Label>
                    <p className="text-sm text-muted-foreground">
                      Display Learners Council events in the feed
                    </p>
                  </div>
                  <Switch
                    id="show-events"
                    checked={showEvents}
                    onCheckedChange={setShowEvents}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-events">Max events to show</Label>
                  <Input
                    id="max-events"
                    type="number"
                    min={1}
                    max={50}
                    value={maxEvents}
                    onChange={(e) => setMaxEvents(Number(e.target.value))}
                    disabled={!showEvents}
                    className="max-w-[120px]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Announcements Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <Megaphone className="h-4 w-4" />
                Announcements
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show-announcements">Show LC Announcements</Label>
                    <p className="text-sm text-muted-foreground">
                      Display Learners Council announcements in the feed
                    </p>
                  </div>
                  <Switch
                    id="show-announcements"
                    checked={showAnnouncements}
                    onCheckedChange={setShowAnnouncements}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-announcements">Max announcements to show</Label>
                  <Input
                    id="max-announcements"
                    type="number"
                    min={1}
                    max={20}
                    value={maxAnnouncements}
                    onChange={(e) => setMaxAnnouncements(Number(e.target.value))}
                    disabled={!showAnnouncements}
                    className="max-w-[120px]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Polls Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                <BarChart3 className="h-4 w-4" />
                Polls
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show-polls">Show LC Polls</Label>
                    <p className="text-sm text-muted-foreground">
                      Display Learners Council polls in the feed
                    </p>
                  </div>
                  <Switch
                    id="show-polls"
                    checked={showPolls}
                    onCheckedChange={setShowPolls}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-polls">Max polls to show</Label>
                  <Input
                    id="max-polls"
                    type="number"
                    min={1}
                    max={10}
                    value={maxPolls}
                    onChange={(e) => setMaxPolls(Number(e.target.value))}
                    disabled={!showPolls}
                    className="max-w-[120px]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={updateConfig.isPending}>
                {updateConfig.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
