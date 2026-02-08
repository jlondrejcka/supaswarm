"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Session, Task, TaskStatus, Json } from "@/lib/supabase-types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  ArrowLeft,
  Clock,
  Hash,
  Radio,
  Coins,
  Timer,
  ListTodo,
  GitFork,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Database,
  Users,
  Bot,
  Wrench,
  Brain,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

interface SessionMetadataRow {
  id: string
  session_id: string
  key: string
  value: Json
  created_at: string | null
}

const sessionStatusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  idle: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  low: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "0"
  return new Intl.NumberFormat().format(num)
}

interface ChildSessionInfo {
  id: string
  agent_id: string | null
  channel_type: string | null
  status: string | null
  spawn_depth: number
  display_name: string | null
  spawn_parent_task_id: string | null
  created_at: string | null
}

interface TaskMessageInfo {
  id: string
  task_id: string
  type: string
  content: Json
  metadata: Json
  sequence_number: number
  created_at: string | null
}

export default function SessionDetailPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [metadata, setMetadata] = useState<SessionMetadataRow[]>([])
  const [childSessions, setChildSessions] = useState<ChildSessionInfo[]>([])
  const [taskMessages, setTaskMessages] = useState<Record<string, TaskMessageInfo[]>>({})
  const [lineageExpanded, setLineageExpanded] = useState(true)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSession()
    fetchTasks()
    fetchMetadata()
    fetchChildSessions()
  }, [sessionId])

  // Real-time subscription for session updates
  useEffect(() => {
    if (!supabase || !sessionId) return

    const client = supabase
    const channel = client
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session)
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [sessionId])

  // Real-time subscription for tasks in this session
  useEffect(() => {
    if (!supabase || !sessionId) return

    const client = supabase
    const channel = client
      .channel(`session-tasks-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setTasks((prev) => [...prev, payload.new as Task])
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setTasks((prev) =>
            prev.map((t) => (t.id === (payload.new as Task).id ? (payload.new as Task) : t))
          )
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [sessionId])

  async function fetchSession() {
    if (!supabase || !sessionId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single()

      if (error) throw error
      setSession(data)
    } catch (error) {
      console.error("Failed to fetch session:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTasks() {
    if (!supabase || !sessionId) return

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    }
  }

  async function fetchMetadata() {
    if (!supabase || !sessionId) return

    try {
      const { data, error } = await supabase
        .from("session_metadata" as any)
        .select("*")
        .eq("session_id", sessionId)

      if (error) throw error
      setMetadata((data || []) as unknown as SessionMetadataRow[])
    } catch (error) {
      console.error("Failed to fetch session metadata:", error)
    }
  }

  async function fetchChildSessions() {
    if (!supabase || !sessionId) return
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, agent_id, channel_type, status, spawn_depth, display_name, spawn_parent_task_id, created_at")
        .eq("parent_session_id", sessionId)
        .order("created_at", { ascending: true })
      if (error) throw error
      setChildSessions((data || []) as ChildSessionInfo[])
    } catch (error) {
      console.error("Failed to fetch child sessions:", error)
    }
  }

  async function fetchTaskMessagesForTask(taskId: string) {
    if (!supabase) return
    try {
      const { data, error } = await supabase
        .from("task_messages" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("sequence_number", { ascending: true })
      if (error) throw error
      setTaskMessages(prev => ({
        ...prev,
        [taskId]: (data || []) as unknown as TaskMessageInfo[],
      }))
    } catch (error) {
      console.error("Failed to fetch task messages:", error)
    }
  }

  function toggleTaskExpand(taskId: string) {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
        // Fetch messages on expand
        if (!taskMessages[taskId]) {
          fetchTaskMessagesForTask(taskId)
        }
      }
      return next
    })
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-6 space-y-6">
        <Link href="/sessions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sessions
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Session not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusColor = sessionStatusColors[session.status || "closed"] || sessionStatusColors.closed

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/sessions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold font-mono">
                {session.id.slice(0, 8)}...
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                  statusColor
                )}
              >
                {session.status || "closed"}
              </span>
              {session.channel_type && (
                <Badge variant="outline" className="text-xs">
                  {session.channel_type}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Created{" "}
              {session.created_at &&
                formatDistanceToNow(new Date(session.created_at), {
                  addSuffix: true,
                })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchSession()
            fetchTasks()
            fetchMetadata()
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Info Cards Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Status Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Radio className="h-4 w-4" />
              <span>Status</span>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium",
                statusColor
              )}
            >
              {session.status || "closed"}
            </span>
            {session.display_name && (
              <p className="text-xs text-muted-foreground mt-2 truncate">
                {session.display_name}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Channel Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Hash className="h-4 w-4" />
              <span>Channel</span>
            </div>
            <div className="space-y-1">
              {session.channel_type && (
                <Badge variant="outline">{session.channel_type}</Badge>
              )}
              {session.channel_id && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {session.channel_id}
                </p>
              )}
              {session.thread_id && (
                <p className="text-xs text-muted-foreground font-mono truncate">
                  Thread: {session.thread_id}
                </p>
              )}
              {!session.channel_type && !session.channel_id && (
                <p className="text-xs text-muted-foreground">No channel</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tokens Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Coins className="h-4 w-4" />
              <span>Tokens</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Input</span>
                <span className="font-medium font-mono">
                  {formatNumber(session.tokens_input)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Output</span>
                <span className="font-medium font-mono">
                  {formatNumber(session.tokens_output)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium font-mono">
                  {formatNumber(
                    (session.tokens_input || 0) + (session.tokens_output || 0)
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Timing Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Timer className="h-4 w-4" />
              <span>Timing</span>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Created</span>
                <p className="font-medium">
                  {session.created_at
                    ? formatDistanceToNow(new Date(session.created_at), {
                        addSuffix: true,
                      })
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">
                  Last Activity
                </span>
                <p className="font-medium">
                  {session.last_activity_at
                    ? formatDistanceToNow(new Date(session.last_activity_at), {
                        addSuffix: true,
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spawn Info */}
      {(session.parent_session_id || session.spawn_parent_task_id) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <GitFork className="h-4 w-4" />
              Spawn Info
            </div>
            <div className="space-y-2 text-sm">
              {session.parent_session_id && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Parent Session:</span>
                  <Link href={`/sessions/${session.parent_session_id}`}>
                    <span className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1">
                      {session.parent_session_id.slice(0, 8)}...
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </Link>
                </div>
              )}
              {session.spawn_parent_task_id && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    Spawn Parent Task:
                  </span>
                  <Link href={`/tasks/${session.spawn_parent_task_id}`}>
                    <span className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1">
                      {session.spawn_parent_task_id.slice(0, 8)}...
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </Link>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Spawn Depth:</span>
                <Badge variant="secondary" className="text-xs">
                  {session.spawn_depth}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Metadata (collapsible) */}
      {metadata.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="metadata">
            <Card>
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Database className="h-4 w-4" />
                  Session Metadata ({metadata.length})
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2">
                    {metadata.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-start gap-4 bg-muted rounded-md p-3"
                      >
                        <span className="text-sm font-medium font-mono shrink-0">
                          {row.key}
                        </span>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-all flex-1">
                          {typeof row.value === "string"
                            ? row.value
                            : JSON.stringify(row.value, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </AccordionContent>
            </Card>
          </AccordionItem>
        </Accordion>
      )}

      {/* Execution Trace */}
      {tasks.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <button
              onClick={() => setLineageExpanded(!lineageExpanded)}
              className="flex items-center gap-2 text-sm font-semibold w-full text-left mb-3"
            >
              {lineageExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <GitFork className="h-4 w-4" />
              Execution Trace
              <Badge variant="secondary" className="ml-auto text-xs">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                {childSessions.length > 0 && `, ${childSessions.length} delegation${childSessions.length !== 1 ? "s" : ""}`}
              </Badge>
            </button>

            {lineageExpanded && (
              <div className="space-y-1 font-mono text-xs">
                {/* Session header */}
                <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50">
                  <Radio className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold">
                    Session {session.id.slice(0, 8)}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {session.channel_type}
                  </Badge>
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium",
                      statusColor
                    )}
                  >
                    {session.status}
                  </span>
                </div>

                {/* Tasks tree */}
                <div className="ml-4 border-l-2 border-muted pl-3 space-y-0.5">
                  {tasks.map((task) => {
                    const isExpanded = expandedTasks.has(task.id)
                    const msgs = taskMessages[task.id] || []
                    const childSession = childSessions.find(
                      (cs) => cs.spawn_parent_task_id === task.id
                    )

                    return (
                      <div key={task.id}>
                        <button
                          onClick={() => toggleTaskExpand(task.id)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors w-full text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <StatusBadge status={task.status as TaskStatus} />
                          <span className="text-muted-foreground">
                            Task {task.id.slice(0, 8)}
                          </span>
                          {task.agent_slug && (
                            <Badge variant="secondary" className="text-[9px] h-4">
                              {task.agent_slug}
                            </Badge>
                          )}
                          {task.status === "pending_subtask" && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-4 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                            >
                              delegating
                            </Badge>
                          )}
                          <span className="ml-auto text-muted-foreground">
                            {task.created_at &&
                              formatDistanceToNow(new Date(task.created_at), {
                                addSuffix: true,
                              })}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="ml-6 border-l border-muted pl-3 py-1 space-y-0.5">
                            {msgs.length === 0 && !childSession && (
                              <div className="text-muted-foreground px-2 py-0.5">
                                <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                                Loading...
                              </div>
                            )}
                            {msgs
                              .filter(
                                (m) =>
                                  m.type !== "user_message" &&
                                  m.type !== "assistant_message"
                              )
                              .map((m) => {
                                const Icon = getTraceIcon(m.type)
                                const color = getTraceColor(m.type)
                                const content = m.content as { text?: string }
                                const meta = m.metadata as { duration_ms?: number; tool_name?: string }

                                return (
                                  <div
                                    key={m.id}
                                    className="flex items-center gap-1.5 px-2 py-0.5 text-[10px]"
                                  >
                                    <Icon className={`h-3 w-3 shrink-0 ${color}`} />
                                    <span className={color}>
                                      {content.text?.slice(0, 80) || m.type}
                                    </span>
                                    {meta?.duration_ms && (
                                      <span className="text-muted-foreground ml-auto">
                                        {(meta.duration_ms / 1000).toFixed(1)}s
                                      </span>
                                    )}
                                  </div>
                                )
                              })}

                            {/* Child session (delegation) */}
                            {childSession && (
                              <div className="mt-1 p-2 rounded bg-indigo-500/5 border border-indigo-500/15">
                                <Link
                                  href={`/sessions/${childSession.id}`}
                                  className="flex items-center gap-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  <Users className="h-3 w-3" />
                                  <span className="font-medium">
                                    Delegation → {childSession.display_name || childSession.id.slice(0, 8)}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded px-1 py-0.5 text-[8px] font-medium",
                                      sessionStatusColors[childSession.status || "closed"]
                                    )}
                                  >
                                    {childSession.status}
                                  </span>
                                  <ChevronRight className="h-3 w-3 ml-auto" />
                                </Link>
                              </div>
                            )}

                            {/* Link to full task detail */}
                            <Link
                              href={`/tasks/${task.id}`}
                              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-primary hover:underline"
                            >
                              View full task details
                              <ChevronRight className="h-2.5 w-2.5" />
                            </Link>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Summary */}
                <div className="flex items-center gap-3 px-2 py-1 mt-2 text-muted-foreground border-t border-muted pt-2">
                  <span>
                    {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                  </span>
                  {childSessions.length > 0 && (
                    <span>
                      {childSessions.length} delegation{childSessions.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {tasks.filter((t) => t.status === "completed").length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {tasks.filter((t) => t.status === "completed").length} completed
                    </span>
                  )}
                  {tasks.filter((t) => t.status === "failed").length > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {tasks.filter((t) => t.status === "failed").length} failed
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tasks in Session */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ListTodo className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Tasks ({tasks.length})</h2>
        </div>

        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                No tasks in this session yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <Link key={task.id} href={`/tasks/${task.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge status={task.status as TaskStatus} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {task.id.slice(0, 8)}
                      </span>
                      {task.agent_slug && (
                        <Badge variant="secondary" className="text-xs">
                          {task.agent_slug}
                        </Badge>
                      )}
                      {task.priority && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                            priorityColors[task.priority] || priorityColors.normal
                          )}
                        >
                          {task.priority}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {task.created_at &&
                          formatDistanceToNow(new Date(task.created_at), {
                            addSuffix: true,
                          })}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Session Details Sidebar Info */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-semibold">Session Details</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Full ID</span>
              <p className="font-mono text-xs break-all">{session.id}</p>
            </div>

            <Separator />

            {session.sender_id && (
              <>
                <div>
                  <span className="text-muted-foreground">Sender</span>
                  <p className="font-mono text-xs break-all">
                    {session.sender_id}
                  </p>
                </div>
                <Separator />
              </>
            )}

            {(session.default_model_provider || session.default_model) && (
              <>
                <div>
                  <span className="text-muted-foreground">Default Model</span>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {session.default_model_provider && (
                      <Badge variant="outline" className="text-xs">
                        {session.default_model_provider}
                      </Badge>
                    )}
                    {session.default_model && (
                      <Badge variant="secondary" className="text-xs">
                        {session.default_model}
                      </Badge>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            <div>
              <span className="text-muted-foreground">Idle Timeout</span>
              <p className="font-medium">{session.idle_timeout_min} min</p>
            </div>

            <Separator />

            {session.max_tokens && (
              <>
                <div>
                  <span className="text-muted-foreground">Max Tokens</span>
                  <p className="font-medium font-mono">
                    {formatNumber(session.max_tokens)}
                  </p>
                </div>
                <Separator />
              </>
            )}

            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium">
                {session.created_at &&
                  format(new Date(session.created_at), "MMM d, yyyy HH:mm:ss")}
              </p>
            </div>

            {session.last_activity_at && (
              <>
                <Separator />
                <div>
                  <span className="text-muted-foreground">Last Activity</span>
                  <p className="font-medium">
                    {format(
                      new Date(session.last_activity_at),
                      "MMM d, yyyy HH:mm:ss"
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Trace helpers ───

function getTraceIcon(type: string) {
  const icons: Record<string, typeof Brain> = {
    thinking: Brain,
    tool_call: Wrench,
    tool_result: Wrench,
    skill_load: Sparkles,
    error: AlertCircle,
    status_change: RefreshCw,
    handoff: Users,
    delegation_start: Users,
    delegation_complete: Users,
    subtask_created: GitFork,
  }
  return icons[type] || Bot
}

function getTraceColor(type: string) {
  const colors: Record<string, string> = {
    thinking: "text-amber-500",
    tool_call: "text-purple-500",
    tool_result: "text-purple-400",
    skill_load: "text-pink-500",
    error: "text-red-500",
    status_change: "text-muted-foreground",
    handoff: "text-teal-500",
    delegation_start: "text-indigo-500",
    delegation_complete: "text-indigo-400",
    subtask_created: "text-cyan-500",
  }
  return colors[type] || "text-muted-foreground"
}
