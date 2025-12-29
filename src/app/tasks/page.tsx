"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Task, TaskStatus } from "@/lib/supabase-types"
import { Plus, RefreshCw, ChevronRight, X, Clock, Bot, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | "all">("all")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

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
          <Button variant="outline" size="sm" onClick={fetchTasks} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" data-testid="button-create-task">
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
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <Card 
              key={task.id} 
              className="hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => setSelectedTask(task)}
              data-testid={`card-task-${task.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm" data-testid={`text-task-id-${task.id}`}>
                        {task.id.slice(0, 8)}
                      </span>
                      <StatusBadge status={task.status as TaskStatus} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Agent: {task.agent_slug || "Unassigned"}
                    </p>
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
          ))}
        </div>
      )}

      <TaskDetailDialog 
        task={selectedTask} 
        open={!!selectedTask} 
        onOpenChange={(open) => !open && setSelectedTask(null)} 
      />
    </div>
  )
}

interface TaskDetailDialogProps {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function TaskDetailDialog({ task, open, onOpenChange }: TaskDetailDialogProps) {
  if (!task) return null

  const input = task.input as { message?: string } | null
  const output = task.output as { response?: string; error?: string; reasoning_steps?: string[]; model_used?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Task Details
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">ID:</span>
                <code className="text-sm bg-muted px-2 py-0.5 rounded" data-testid="text-detail-task-id">{task.id}</code>
              </div>
              <StatusBadge status={task.status as TaskStatus} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Agent:</span>
                <p className="font-medium">{task.agent_slug || "Unassigned"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <p className="font-medium">
                  {task.created_at && format(new Date(task.created_at), "MMM d, yyyy HH:mm:ss")}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Input
              </h3>
              <Card>
                <CardContent className="p-3">
                  <pre className="text-sm whitespace-pre-wrap font-mono" data-testid="text-task-input">
                    {input?.message || JSON.stringify(task.input, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>

            {output && (
              <>
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    {task.status === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    Output
                  </h3>
                  <Card>
                    <CardContent className="p-3">
                      {output.error ? (
                        <p className="text-sm text-destructive" data-testid="text-task-error">{output.error}</p>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap" data-testid="text-task-response">{output.response}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {output.model_used && (
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Model:</span>
                      <Badge variant="outline">{output.model_used}</Badge>
                    </div>
                    {output.usage && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Tokens:</span>
                        <span>{output.usage.total_tokens}</span>
                      </div>
                    )}
                  </div>
                )}

                {output.reasoning_steps && output.reasoning_steps.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Reasoning Steps
                    </h3>
                    <Card>
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          {output.reasoning_steps.map((step, i) => (
                            <div key={i} className="text-sm">
                              <pre className="whitespace-pre-wrap text-muted-foreground font-mono text-xs">{step}</pre>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}

            {task.logs && (task.logs as string[]).length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Logs</h3>
                <Card>
                  <CardContent className="p-3">
                    <div className="space-y-1 font-mono text-xs">
                      {(task.logs as string[]).map((log, i) => (
                        <p key={i} className="text-muted-foreground">{log}</p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
