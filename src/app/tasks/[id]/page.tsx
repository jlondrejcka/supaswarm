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
import { ArrowLeft, Clock, Bot, MessageSquare, AlertCircle, CheckCircle2, RefreshCw, Terminal, ListTree, Users, ChevronRight, ShieldAlert, MessageCircle } from "lucide-react"
import { TaskMessageThread } from "@/components/task-message-thread"
import { format, formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function TaskDetailPage() {
  const params = useParams()
  const taskId = params.id as string
  const [task, setTask] = useState<Task | null>(null)
  const [subtasks, setSubtasks] = useState<Task[]>([])
  const [approvalRequest, setApprovalRequest] = useState<{
    id: string; action_type: string; payload: Record<string, unknown>;
    resource_table: string; resource_id: string; status: string;
    agent_name?: string; agent_slug?: string;
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const [commentText, setCommentText] = useState("")

  useEffect(() => {
    fetchTask()
    fetchSubtasks()
    fetchApprovalRequest()
  }, [taskId])

  // Re-fetch approval request when task enters needs_human_review
  useEffect(() => {
    if (task?.status === "needs_human_review") {
      fetchApprovalRequest()
    } else {
      setApprovalRequest(null)
    }
  }, [task?.status])

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
        .eq("session_id", task?.session_id ?? "")
        .order("created_at", { ascending: true })

      if (error) throw error
      setSubtasks(data || [])
    } catch (error) {
      console.error("Failed to fetch subtasks:", error)
    }
  }

  async function handleRetry() {
    if (!supabase || !taskId) return
    setRetrying(true)

    try {
      // Use the retry_task RPC function
      const { data: result, error: rpcError } = await supabase.rpc("retry_task", {
        p_task_id: taskId,
        p_clear_output: false
      })

      if (rpcError) {
        console.error("RPC error:", rpcError)
        return
      }

      const retryResult = result as { success?: boolean; error?: string } | null
      if (!retryResult?.success) {
        console.error("Retry failed:", retryResult?.error)
        return
      }

      // Task pickup handled by pgmq queue trigger
      await fetchTask()
    } catch (error) {
      console.error("Failed to retry task:", error)
    } finally {
      setRetrying(false)
    }
  }

  async function fetchApprovalRequest() {
    if (!supabase || !taskId) return
    try {
      const { data } = await supabase
        .from("approval_requests")
        .select("id, action_type, payload, resource_table, resource_id, status, agents!approval_requests_agent_id_fkey(name, slug)")
        .eq("task_id", taskId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        const agentInfo = data.agents as unknown as { name: string; slug: string } | null
        setApprovalRequest({
          id: data.id,
          action_type: data.action_type,
          payload: (data.payload ?? {}) as Record<string, unknown>,
          resource_table: data.resource_table,
          resource_id: data.resource_id,
          status: data.status,
          agent_name: agentInfo?.name,
          agent_slug: agentInfo?.slug,
        })
      } else {
        setApprovalRequest(null)
      }
    } catch (error) {
      console.error("Failed to fetch approval request:", error)
    }
  }

  async function handleApproval(decision: "approved" | "rejected") {
    if (!supabase || !approvalRequest) return
    setApproving(true)
    try {
      const notes = showComment && commentText.trim() ? commentText.trim() : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("review_approval_request", {
        p_approval_id: approvalRequest.id,
        p_decision: decision,
        p_notes: notes,
      })
      if (error) {
        console.error("Approval error:", error)
        return
      }
      setApprovalRequest(null)
      setShowComment(false)
      setCommentText("")
      await fetchTask()
    } catch (error) {
      console.error("Failed to process approval:", error)
    } finally {
      setApproving(false)
    }
  }

  // Retry: failed, cancelled, or needs_human_review without a pending approval (pure error escalation)
  const canRetry = task?.status && (
    ['failed', 'cancelled'].includes(task.status) ||
    (task.status === 'needs_human_review' && !approvalRequest)
  )
  const showApproval = task?.status === 'needs_human_review' && approvalRequest

  // Extract full tool args from intermediate_data.pending_approval
  const iDataRaw = task?.intermediate_data as Record<string, unknown> | null
  const pendingApprovalArgs = (iDataRaw?.pending_approval as { args?: Record<string, unknown> })?.args ?? null

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
        <div className="flex gap-2">
          {canRetry && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleRetry}
              disabled={retrying}
              data-testid="button-retry"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Retrying...' : 'Retry'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { fetchTask(); fetchSubtasks(); fetchApprovalRequest(); }} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
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
          {/* Approval request card — TOP of sidebar when present */}
          {showApproval && approvalRequest && (
            <ApprovalCard
              approvalRequest={approvalRequest}
              pendingArgs={pendingApprovalArgs}
              approving={approving}
              showComment={showComment}
              commentText={commentText}
              onToggleComment={setShowComment}
              onCommentChange={setCommentText}
              onApprove={() => handleApproval("approved")}
              onReject={() => handleApproval("rejected")}
            />
          )}

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
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <StatusBadge status={task.status as TaskStatus} />
                    {task.priority && task.priority !== 'medium' && (
                      <Badge className={
                        task.priority === 'urgent' ? 'bg-red-500/15 text-red-600 border-red-500/30' :
                        task.priority === 'high' ? 'bg-orange-500/15 text-orange-600 border-orange-500/30' :
                        'bg-gray-500/15 text-gray-600 border-gray-500/30'
                      }>
                        {task.priority}
                      </Badge>
                    )}
                    {task.mission_status && (
                      <Badge variant="outline" className={
                        task.mission_status === 'done' ? 'bg-green-500/15 text-green-600 border-green-500/30' :
                        task.mission_status === 'in_progress' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' :
                        task.mission_status === 'blocked' ? 'bg-red-500/15 text-red-600 border-red-500/30' :
                        task.mission_status === 'review' ? 'bg-purple-500/15 text-purple-600 border-purple-500/30' :
                        'bg-blue-500/15 text-blue-600 border-blue-500/30'
                      }>
                        {task.mission_status}
                      </Badge>
                    )}
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

                {task.session_id && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Session</span>
                      <Link href={`/sessions/${task.session_id}`}>
                        <p className="font-mono text-xs text-primary hover:underline">
                          {task.session_id.slice(0, 8)}...
                        </p>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Delegation info */}
          <DelegationInfoCard task={task} />

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

// ─── Human-readable labels for action_type ───
const ACTION_LABELS: Record<string, { verb: string; icon: string }> = {
  create_agent: { verb: "Create Agent", icon: "🤖" },
  update_agent: { verb: "Update Agent", icon: "✏️" },
  create_tool: { verb: "Create Tool", icon: "🔧" },
  update_tool: { verb: "Update Tool", icon: "🔧" },
  create_cron: { verb: "Create Cron Job", icon: "⏰" },
  update_cron: { verb: "Update Cron Job", icon: "⏰" },
  delete_cron: { verb: "Delete Cron Job", icon: "🗑️" },
  deploy_function: { verb: "Deploy Function", icon: "🚀" },
}

// Fields to display prominently per action_type
const DISPLAY_FIELDS: Record<string, string[]> = {
  create_agent: ["name", "model", "temperature", "description", "system_prompt"],
  update_agent: ["name", "model", "temperature", "description", "system_prompt", "is_active"],
  create_tool: ["name", "type", "description"],
  update_tool: ["name", "type", "description"],
  create_cron: ["cron_name", "cron_schedule", "edge_function", "cron_type"],
  update_cron: ["cron_name", "cron_schedule", "edge_function"],
  delete_cron: ["cron_id"],
  deploy_function: ["function_name", "function_slug"],
}

function ApprovalCard({
  approvalRequest,
  pendingArgs,
  approving,
  showComment,
  commentText,
  onToggleComment,
  onCommentChange,
  onApprove,
  onReject,
}: {
  approvalRequest: {
    id: string; action_type: string; payload: Record<string, unknown>;
    resource_table: string; resource_id: string; status: string;
    agent_name?: string; agent_slug?: string;
  }
  pendingArgs: Record<string, unknown> | null
  approving: boolean
  showComment: boolean
  commentText: string
  onToggleComment: (v: boolean) => void
  onCommentChange: (v: string) => void
  onApprove: () => void
  onReject: () => void
}) {
  const label = ACTION_LABELS[approvalRequest.action_type] ?? { verb: approvalRequest.action_type.replace(/_/g, " "), icon: "📋" }
  const fields = DISPLAY_FIELDS[approvalRequest.action_type] ?? []
  // Merge payload + pendingArgs for display (pendingArgs has the full data)
  const displayData = pendingArgs ?? approvalRequest.payload ?? {}

  // Build headline: "Rick wants to Create Agent 'Jorge'"
  const resourceName = (displayData.name as string) || (approvalRequest.payload.name as string) || ""
  const headline = `${approvalRequest.agent_name || "Agent"} wants to ${label.verb}${resourceName ? `: ${resourceName}` : ""}`

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="text-2xl mt-0.5">{label.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-amber-600 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Approval Required
            </h3>
            <p className="text-sm font-medium mt-1">{headline}</p>
          </div>
        </div>

        <Separator />

        {/* Key fields */}
        <div className="space-y-3 text-sm">
          {fields.map((field) => {
            const value = displayData[field]
            if (value === undefined || value === null) return null
            const fieldLabel = field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            const isLong = typeof value === "string" && value.length > 80

            return (
              <div key={field}>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">{fieldLabel}</span>
                {isLong ? (
                  <div className="bg-muted rounded-md p-2 mt-1 max-h-32 overflow-y-auto">
                    <p className="text-xs whitespace-pre-wrap">{String(value)}</p>
                  </div>
                ) : (
                  <p className="font-medium text-sm">{String(value)}</p>
                )}
              </div>
            )
          })}
        </div>

        <Separator />

        {/* Comment checkbox + textarea */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="add-comment"
              checked={showComment}
              onCheckedChange={(checked) => onToggleComment(checked === true)}
            />
            <Label htmlFor="add-comment" className="text-sm cursor-pointer flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              Add feedback
            </Label>
          </div>
          {showComment && (
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              rows={3}
              placeholder="Feedback for the agent..."
              value={commentText}
              onChange={(e) => onCommentChange(e.target.value)}
            />
          )}
        </div>

        {/* Approve / Reject buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={onApprove}
            disabled={approving}
          >
            {approving ? "Processing..." : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            onClick={onReject}
            disabled={approving}
          >
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DelegationInfoCard({ task }: { task: Task }) {
  if (task.status !== "pending_subtask" || !task.intermediate_data) return null
  const iData = task.intermediate_data as Record<string, unknown>
  if (!iData.delegation) return null
  const delegation = iData.delegation as Record<string, string>

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-500" />
          Delegation
        </h3>
        <div className="space-y-2 text-sm">
          {delegation.target_agent_slug && (
            <div>
              <span className="text-muted-foreground">Sub-Agent</span>
              <p className="font-medium">{delegation.target_agent_slug}</p>
            </div>
          )}
          {delegation.child_session_id && (
            <div>
              <span className="text-muted-foreground">Child Session</span>
              <Link href={`/sessions/${delegation.child_session_id}`}>
                <p className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1">
                  {delegation.child_session_id.slice(0, 8)}...
                  <ChevronRight className="h-3 w-3" />
                </p>
              </Link>
            </div>
          )}
          {delegation.child_task_id && (
            <div>
              <span className="text-muted-foreground">Child Task</span>
              <Link href={`/tasks/${delegation.child_task_id}`}>
                <p className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1">
                  {delegation.child_task_id.slice(0, 8)}...
                  <ChevronRight className="h-3 w-3" />
                </p>
              </Link>
            </div>
          )}
          {delegation.delegated_at && (
            <div>
              <span className="text-muted-foreground">Delegated</span>
              <p className="text-xs">{formatDistanceToNow(new Date(delegation.delegated_at), { addSuffix: true })}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
