"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import { ChatDialog } from "@/components/chat-dialog"
import type { Task, TaskStatus } from "@/lib/supabase-types"
import { Plus, RefreshCw, ChevronRight, LayoutList, LayoutGrid } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

type ViewMode = "list" | "board"

const MISSION_STATUSES = ["inbox", "assigned", "in_progress", "review", "done", "blocked"] as const
type MissionStatus = (typeof MISSION_STATUSES)[number]

const missionStatusColors: Record<MissionStatus, string> = {
  inbox: "bg-gray-500/15 text-gray-600",
  assigned: "bg-blue-500/15 text-blue-600",
  in_progress: "bg-amber-500/15 text-amber-600",
  review: "bg-purple-500/15 text-purple-600",
  done: "bg-green-500/15 text-green-600",
  blocked: "bg-red-500/15 text-red-600",
}

function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority || priority === "medium") return null
  if (priority === "low") {
    return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="Low priority" />
  }
  if (priority === "high") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-orange-500/15 text-orange-600">
        High
      </span>
    )
  }
  if (priority === "urgent") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-600">
        Urgent
      </span>
    )
  }
  return null
}

function MissionStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null
  const colors = missionStatusColors[status as MissionStatus] || "bg-gray-500/15 text-gray-600"
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>
      {status.replace("_", " ")}
    </span>
  )
}

function TaskCard({ task }: { task: Task }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      data-testid={`link-task-${task.id}`}
    >
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm" data-testid={`text-task-id-${task.id}`}>
                  {task.id.slice(0, 8)}
                </span>
                <StatusBadge status={task.status as TaskStatus} />
                <PriorityBadge priority={task.priority} />
                <MissionStatusBadge status={task.mission_status} />
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Agent: {task.agent_slug || "Unassigned"}
                </p>
                {task.session_id && (
                  <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {task.session_id.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {task.created_at && formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function BoardView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {MISSION_STATUSES.map((col) => {
        const colTasks = tasks.filter(
          (t) => (t.mission_status || "inbox") === col
        )
        return (
          <div key={col} className="flex-shrink-0" style={{ minWidth: 250 }}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${missionStatusColors[col]}`}>
                {col.replace("_", " ")}
              </span>
              <span className="text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                  No tasks
                </div>
              ) : (
                colTasks.map((task) => <TaskCard key={task.id} task={task} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | "all">("all")
  const [view, setView] = useState<ViewMode>("list")
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    fetchTasks()
  }, [])

  async function fetchTasks() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const filteredTasks = filter === "all" 
    ? tasks 
    : tasks.filter(t => t.status === filter)

  const statusCounts = tasks.reduce((acc, task) => {
    acc[task.status as TaskStatus] = (acc[task.status as TaskStatus] || 0) + 1
    return acc
  }, {} as Record<TaskStatus, number>)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Tasks</h1>
          <p className="text-muted-foreground">Manage and monitor orchestrated tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden">
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("list")}
              data-testid="button-view-list"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "board" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setView("board")}
              data-testid="button-view-board"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTasks} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setChatOpen(true)} data-testid="button-create-task">
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          data-testid="button-filter-all"
        >
          All ({tasks.length})
        </Button>
        {(["pending", "running", "completed", "failed", "needs_human_review"] as TaskStatus[]).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            data-testid={`button-filter-${status}`}
          >
            {status.replace("_", " ")} ({statusCounts[status] || 0})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No tasks found</p>
          </CardContent>
        </Card>
      ) : view === "board" ? (
        <BoardView tasks={filteredTasks} />
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      <ChatDialog 
        open={chatOpen} 
        onOpenChange={(open) => {
          setChatOpen(open)
          if (!open) {
            // Refresh tasks when dialog closes
            fetchTasks()
          }
        }} 
      />
    </div>
  )
}
