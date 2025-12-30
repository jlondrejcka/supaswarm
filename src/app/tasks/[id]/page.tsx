"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Task, TaskStatus } from "@/lib/supabase-types"
import { ArrowLeft, Clock, Bot, MessageSquare, AlertCircle, CheckCircle2, RefreshCw, Terminal, ListTree } from "lucide-react"
import { TaskMessageThread } from "@/components/task-message-thread"
import { format, formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export default function TaskDetailPage() {
  const params = useParams()
  const taskId = params.id as string
  const [task, setTask] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTask()
    fetchSubtasks()
  }, [taskId])

  useEffect(() => {
    if (!supabase || !taskId) return

    const client = supabase
    const channel = client
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`,
        },
        (payload) => {
          setTask(payload.new as Task)
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [taskId])

  async function fetchTask() {
    if (!supabase || !taskId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single()

      if (error) throw error
      setTask(data)
    } catch (error) {
      console.error("Failed to fetch task:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSubtasks() {
    if (!supabase || !taskId) return

    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("master_task_id", taskId)
        .order("created_at", { ascending: true })

      if (error) throw error
      setSubtasks(data || [])
    } catch (error) {
      console.error("Failed to fetch subtasks:", error)
    }
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
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="p-6 space-y-6">
        <Link href="/tasks">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tasks
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Task not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const input = task.input as { message?: string } | null
  const output = task.output as { 
    response?: string
    error?: string
    reasoning_steps?: string[]
    model_used?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  } | null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/tasks">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold font-mono" data-testid="text-task-id">
                {task.id.slice(0, 8)}...
              </h1>
              <StatusBadge status={task.status as TaskStatus} />
            </div>
            <p className="text-sm text-muted-foreground">
              Created {task.created_at && formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchTask(); fetchSubtasks(); }} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Input
                </h3>
                <div className="bg-muted rounded-md p-3">
                  <pre className="text-sm whitespace-pre-wrap font-mono" data-testid="text-task-input">
                    {input?.message || JSON.stringify(task.input, null, 2)}
                  </pre>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  {task.status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : task.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  Output
                </h3>
                {output ? (
                  <div className="bg-muted rounded-md p-3">
                    {output.error ? (
                      <p className="text-sm text-destructive" data-testid="text-task-error">{output.error}</p>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-task-response">{output.response}</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Waiting for output...</p>
                  </div>
                )}
              </div>

              {output?.reasoning_steps && output.reasoning_steps.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Reasoning Steps ({output.reasoning_steps.length})
                    </h3>
                    <div className="space-y-2">
                      {output.reasoning_steps.map((step, i) => (
                        <div key={i} className="bg-muted rounded-md p-3">
                          <pre className="whitespace-pre-wrap text-muted-foreground font-mono text-xs">{step}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {task.logs && (task.logs as string[]).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Logs</h3>
                    <div className="bg-muted rounded-md p-3 space-y-1 font-mono text-xs">
                      {(task.logs as string[]).map((log, i) => (
                        <p key={i} className="text-muted-foreground">{log}</p>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Message Thread
              </h3>
              <TaskMessageThread taskId={taskId} variant="log" />
            </CardContent>
          </Card>

          {subtasks.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <ListTree className="h-4 w-4" />
                  Subtasks ({subtasks.length})
                </h3>
                <Accordion type="single" collapsible className="w-full">
                  {subtasks.map((subtask, index) => {
                    const subtaskInput = subtask.input as { message?: string } | null
                    const subtaskOutput = subtask.output as { 
                      response?: string
                      error?: string
                      reasoning_steps?: string[]
                    } | null
                    
                    return (
                      <AccordionItem key={subtask.id} value={subtask.id}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3 text-left">
                            <span className="text-muted-foreground text-xs font-mono">#{index + 1}</span>
                            <StatusBadge status={subtask.status as TaskStatus} />
                            <span className="font-mono text-xs">{subtask.id.slice(0, 8)}</span>
                            <span className="text-muted-foreground text-xs">
                              {subtask.agent_slug || "Unassigned"}
                            </span>
                            <span className="text-muted-foreground text-xs ml-auto">
                              {subtask.created_at && format(new Date(subtask.created_at), "HH:mm:ss")}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-2">
                            <Card>
                              <CardContent className="p-4 space-y-4">
                                <div>
                                  <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                                    <MessageSquare className="h-4 w-4" />
                                    Input
                                  </h4>
                                  <div className="bg-muted rounded-md p-3">
                                    <pre className="text-sm whitespace-pre-wrap font-mono">
                                      {subtaskInput?.message || JSON.stringify(subtask.input, null, 2)}
                                    </pre>
                                  </div>
                                </div>

                                <Separator />

                                <div>
                                  <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                                    {subtask.status === 'failed' ? (
                                      <AlertCircle className="h-4 w-4 text-destructive" />
                                    ) : subtask.status === 'completed' ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <Clock className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    Output
                                  </h4>
                                  {subtaskOutput ? (
                                    <div className="bg-muted rounded-md p-3">
                                      {subtaskOutput.error ? (
                                        <p className="text-sm text-destructive">{subtaskOutput.error}</p>
                                      ) : (
                                        <p className="text-sm whitespace-pre-wrap">{subtaskOutput.response}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-muted rounded-md p-3">
                                      <p className="text-sm text-muted-foreground">Waiting for output...</p>
                                    </div>
                                  )}
                                </div>

                                {subtaskOutput?.reasoning_steps && subtaskOutput.reasoning_steps.length > 0 && (
                                  <>
                                    <Separator />
                                    <div>
                                      <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                                        <Clock className="h-4 w-4" />
                                        Reasoning Steps ({subtaskOutput.reasoning_steps.length})
                                      </h4>
                                      <div className="space-y-2">
                                        {subtaskOutput.reasoning_steps.map((step, i) => (
                                          <div key={i} className="bg-muted rounded-md p-3">
                                            <pre className="whitespace-pre-wrap text-muted-foreground font-mono text-xs">{step}</pre>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </>
                                )}

                                <div className="flex justify-end">
                                  <Link href={`/tasks/${subtask.id}`} className="text-xs text-primary hover:underline">
                                    View Full Details →
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardContent className="p-4">
                                <h4 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                                  <Terminal className="h-4 w-4" />
                                  Message Thread
                                </h4>
                                <TaskMessageThread taskId={subtask.id} variant="log" />
                              </CardContent>
                            </Card>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold">Task Info</h3>
              
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Full ID</span>
                  <p className="font-mono text-xs break-all">{task.id}</p>
                </div>

                <Separator />

                <div>
                  <span className="text-muted-foreground">Agent</span>
                  <p className="font-medium">{task.agent_slug || "Unassigned"}</p>
                </div>

                <Separator />

                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <StatusBadge status={task.status as TaskStatus} />
                  </div>
                </div>

                <Separator />

                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="font-medium">
                    {task.created_at && format(new Date(task.created_at), "MMM d, yyyy HH:mm:ss")}
                  </p>
                </div>

                {task.parent_id && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Parent Task</span>
                      <Link href={`/tasks/${task.parent_id}`}>
                        <p className="font-mono text-xs text-primary hover:underline">
                          {task.parent_id.slice(0, 8)}...
                        </p>
                      </Link>
                    </div>
                  </>
                )}

                {task.master_task_id && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Master Task</span>
                      <Link href={`/tasks/${task.master_task_id}`}>
                        <p className="font-mono text-xs text-primary hover:underline">
                          {task.master_task_id.slice(0, 8)}...
                        </p>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {output?.model_used && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Model Info
                </h3>
                
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Model</span>
                    <div className="mt-1">
                      <Badge variant="outline">{output.model_used}</Badge>
                    </div>
                  </div>

                  {output.usage && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground text-xs">Prompt</span>
                          <p className="font-medium">{output.usage.prompt_tokens}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Completion</span>
                          <p className="font-medium">{output.usage.completion_tokens}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Total Tokens</span>
                          <p className="font-medium">{output.usage.total_tokens}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
