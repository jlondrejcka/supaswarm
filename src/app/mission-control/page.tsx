"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SetupRequired } from "@/components/setup-required"
import {
  Bot,
  ListTodo,
  AlertCircle,
  Activity,
  Radio,
  RefreshCw,
  Zap,
  Inbox,
  UserCheck,
  Play,
  Eye,
  CheckCircle2,
  ShieldAlert,
  Cpu,
} from "lucide-react"
import { useEffect, useState, useCallback } from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import type { Task, Agent, Session } from "@/lib/supabase-types"
import { formatDistanceToNow } from "date-fns"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string
  agent_id: string | null
  type: string
  description: string
  metadata: Record<string, unknown> | null
  created_at: string | null
}

interface DashboardData {
  tasks: Task[]
  agents: Agent[]
  sessions: Session[]
  toolCount: number
  skillCount: number
  activities: ActivityItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-600 border-green-500/30",
  idle: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  offline: "bg-gray-500/15 text-gray-600 border-gray-500/30",
  error: "bg-red-500/15 text-red-600 border-red-500/30",
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-gray-500",
  error: "bg-red-500",
}

const MISSION_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  inbox: { label: "Inbox", color: "text-gray-600", bg: "bg-gray-500" },
  assigned: { label: "Assigned", color: "text-blue-600", bg: "bg-blue-500" },
  in_progress: { label: "In Progress", color: "text-amber-600", bg: "bg-amber-500" },
  review: { label: "Review", color: "text-purple-600", bg: "bg-purple-500" },
  done: { label: "Done", color: "text-green-600", bg: "bg-green-500" },
  blocked: { label: "Blocked", color: "text-red-600", bg: "bg-red-500" },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function relativeTime(date: string | null): string {
  if (!date) return "never"
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return "unknown"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MissionControl() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      const [
        { data: tasks },
        { data: agents },
        { data: sessions },
        { data: tools },
        { data: skills },
      ] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("agents").select("*"),
        supabase.from("sessions").select("*"),
        supabase.from("tools").select("id"),
        supabase.from("skills").select("id"),
      ])

      // Try to fetch activities — table may not exist in typed schema yet
      let activities: ActivityItem[] = []
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: activityRows } = await (supabase as any)
          .from("activities")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10)
        if (activityRows && activityRows.length > 0) {
          activities = activityRows as ActivityItem[]
        }
      } catch {
        // activities table may not exist — we'll fall back to tasks
      }

      setData({
        tasks: tasks || [],
        agents: agents || [],
        sessions: sessions || [],
        toolCount: tools?.length || 0,
        skillCount: skills?.length || 0,
        activities,
      })
    } catch (error) {
      console.error("Failed to fetch mission control data:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  // ---- Guards ----

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  // ---- Derived stats ----

  const tasks = data?.tasks || []
  const agents = data?.agents || []
  const sessions = data?.sessions || []

  const activeSessions = sessions.filter((s) => s.status === "active").length
  const totalTokensIn = sessions.reduce((sum, s) => sum + (s.tokens_input || 0), 0)
  const totalTokensOut = sessions.reduce((sum, s) => sum + (s.tokens_output || 0), 0)
  const totalTokens = totalTokensIn + totalTokensOut

  const activeAgents = agents.filter((a) => a.status === "active").length
  const runningTasks = tasks.filter((t) => t.status === "running").length
  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "queued").length
  const pendingReviews = tasks.filter((t) => t.status === "needs_human_review").length

  // Mission status counts
  const missionCounts: Record<string, number> = {}
  for (const key of Object.keys(MISSION_STATUS_CONFIG)) {
    missionCounts[key] = tasks.filter((t) => t.mission_status === key).length
  }
  const totalMissionTasks = Object.values(missionCounts).reduce((a, b) => a + b, 0)

  // Activity feed — fall back to tasks if no activities
  const activityFeed = data?.activities && data.activities.length > 0
    ? data.activities
    : null
  const recentTasks = tasks
    .slice()
    .sort((a, b) => {
      const da = a.updated_at || a.created_at || ""
      const db = b.updated_at || b.created_at || ""
      return db.localeCompare(da)
    })
    .slice(0, 10)

  // ---- Render ----

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-green-500 animate-pulse" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
              Mission Control
            </h1>
            <p className="text-sm text-muted-foreground">
              Multi-agent orchestration overview
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Sessions"
          icon={<Zap className="h-4 w-4 text-green-500" />}
          value={activeSessions}
          subtitle={`${formatNumber(totalTokens)} tokens used`}
        />
        <StatCard
          title="Active Agents"
          icon={<Bot className="h-4 w-4 text-blue-500" />}
          value={activeAgents}
          subtitle={`of ${agents.length} total agents`}
        />
        <StatCard
          title="Tasks In Progress"
          icon={<ListTodo className="h-4 w-4 text-amber-500" />}
          value={runningTasks + pendingTasks}
          subtitle={`${runningTasks} running, ${pendingTasks} pending`}
        />
        <StatCard
          title="Pending Reviews"
          icon={<AlertCircle className="h-4 w-4 text-red-500" />}
          value={pendingReviews}
          subtitle="Awaiting human approval"
          highlight={pendingReviews > 0}
        />
      </div>

      {/* Agent Fleet */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            Agent Fleet
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No agents configured
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Mission Board */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Mission Board
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalMissionTasks === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No missions tracked yet
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(MISSION_STATUS_CONFIG).map(([key, cfg]) => {
                  const count = missionCounts[key] || 0
                  const pct = totalMissionTasks > 0 ? (count / totalMissionTasks) * 100 : 0
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <MissionIcon status={key} />
                          <span className={cfg.color}>{cfg.label}</span>
                        </div>
                        <span className="font-medium tabular-nums">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.bg} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityFeed ? (
              <div className="space-y-3">
                {activityFeed.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type} &middot; {relativeTime(item.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3">
                    <TaskStatusDot status={task.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        Task {task.id.slice(0, 8)}...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.agent_slug || "unassigned"} &middot;{" "}
                        {relativeTime(task.updated_at || task.created_at)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] flex-shrink-0"
                    >
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Token Usage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Token Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokensIn)}</p>
              <p className="text-xs text-muted-foreground mt-1">Input Tokens</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokensOut)}</p>
              <p className="text-xs text-muted-foreground mt-1">Output Tokens</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums">{formatNumber(totalTokens)}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Tokens</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  title,
  icon,
  value,
  subtitle,
  highlight = false,
}: {
  title: string
  icon: React.ReactNode
  value: number
  subtitle: string
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? "border-red-500/30" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const status = (agent.status || "offline").toLowerCase()
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.offline
  const dotClass = STATUS_DOT[status] || STATUS_DOT.offline

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate">{agent.name}</p>
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
          {status}
        </Badge>
        {agent.role && (
          <Badge variant="outline" className="text-[10px]">
            {agent.role}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Heartbeat: {relativeTime(agent.last_heartbeat)}
      </p>
    </div>
  )
}

function TaskStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-blue-500 animate-pulse",
    completed: "bg-green-500",
    failed: "bg-red-500",
    needs_human_review: "bg-yellow-500",
    pending: "bg-gray-400",
    queued: "bg-gray-400",
    cancelled: "bg-gray-300",
  }
  return (
    <div
      className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${colors[status] || "bg-gray-400"}`}
    />
  )
}

function MissionIcon({ status }: { status: string }) {
  const iconClass = "h-3.5 w-3.5"
  switch (status) {
    case "inbox":
      return <Inbox className={`${iconClass} text-gray-500`} />
    case "assigned":
      return <UserCheck className={`${iconClass} text-blue-500`} />
    case "in_progress":
      return <Play className={`${iconClass} text-amber-500`} />
    case "review":
      return <Eye className={`${iconClass} text-purple-500`} />
    case "done":
      return <CheckCircle2 className={`${iconClass} text-green-500`} />
    case "blocked":
      return <ShieldAlert className={`${iconClass} text-red-500`} />
    default:
      return <Activity className={`${iconClass} text-gray-400`} />
  }
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-1 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent fleet skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two column skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Token usage skeleton */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center space-y-2">
                <Skeleton className="h-9 w-24 mx-auto" />
                <Skeleton className="h-3 w-20 mx-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
