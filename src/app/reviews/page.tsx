"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { HumanReview, Task } from "@/lib/supabase-types"
import { CheckCircle, XCircle, Clock, Users, RefreshCw, AlertTriangle, Edit3, GitBranch } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ReviewWithTask extends HumanReview {
  task?: Task
}

interface ParallelReviewResponse {
  error?: string
  options?: string[]
  is_parallel_task?: boolean
  aggregator_task_id?: string | null
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewWithTask[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [manualInputDialog, setManualInputDialog] = useState<{
    open: boolean
    taskId: string | null
    reviewId: string | null
  }>({ open: false, taskId: null, reviewId: null })
  const [manualInput, setManualInput] = useState("")

  async function fetchData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const [{ data: reviewsData }, { data: tasksData }] = await Promise.all([
        supabase
          .from("human_reviews")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select("*")
          .eq("status", "needs_human_review")
          .order("created_at", { ascending: false })
      ])

      setReviews(reviewsData || [])
      setPendingTasks(tasksData || [])
    } catch (error) {
      console.error("Failed to fetch reviews:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Check if task is a parallel task failure
  function isParallelTaskFailure(task: Task): boolean {
    return task.is_parallel_task === true
  }

  // Get review for a task
  function getReviewForTask(taskId: string): ReviewWithTask | undefined {
    return reviews.find(r => r.task_id === taskId)
  }

  // Get error message from review response
  function getErrorFromReview(review: ReviewWithTask | undefined): string {
    if (!review?.response) return "Unknown error"
    const response = review.response as ParallelReviewResponse
    return response.error || "Unknown error"
  }

  // Handle retry action using database function
  async function handleRetry(taskId: string, _reviewId: string | null) {
    if (!supabase) return
    setActionLoading(taskId)
    
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
      
      if (!result?.success) {
        console.error("Retry failed:", result?.error)
        return
      }
      
      // Trigger task processing
      await supabase.functions.invoke("process-task", {
        body: { task_id: taskId }
      })
      
      await fetchData()
    } catch (error) {
      console.error("Failed to retry task:", error)
    } finally {
      setActionLoading(null)
    }
  }

  // Handle abort action
  async function handleAbort(taskId: string, reviewId: string | null) {
    if (!supabase) return
    setActionLoading(taskId)
    
    try {
      // Find aggregator task that depends on this task
      const { data: aggregatorTasks } = await supabase
        .from("tasks")
        .select("id")
        .contains("dependent_task_ids", [taskId])
        .eq("status", "queued")
      
      // Fail the aggregator(s)
      if (aggregatorTasks && aggregatorTasks.length > 0) {
        for (const agg of aggregatorTasks) {
          await supabase
            .from("tasks")
            .update({ status: "failed" })
            .eq("id", agg.id)
        }
      }
      
      // Mark this task as cancelled
      await supabase
        .from("tasks")
        .update({ status: "cancelled" })
        .eq("id", taskId)
      
      // Update human review
      if (reviewId) {
        await supabase
          .from("human_reviews")
          .update({ 
            approved: false, 
            comments: "Aborted parallel group" 
          })
          .eq("id", reviewId)
      }
      
      await fetchData()
    } catch (error) {
      console.error("Failed to abort task:", error)
    } finally {
      setActionLoading(null)
    }
  }

  // Handle manual input submission
  async function handleManualSubmit() {
    if (!supabase || !manualInputDialog.taskId) return
    setActionLoading(manualInputDialog.taskId)
    
    try {
      // Update task with manual output and mark as completed
      await supabase
        .from("tasks")
        .update({ 
          status: "completed",
          output: { response: manualInput, source: "human_review" }
        })
        .eq("id", manualInputDialog.taskId)
      
      // Update human review
      if (manualInputDialog.reviewId) {
        await supabase
          .from("human_reviews")
          .update({ 
            approved: true,
            response: { manual_output: manualInput },
            comments: "Manual input provided"
          })
          .eq("id", manualInputDialog.reviewId)
      }
      
      setManualInputDialog({ open: false, taskId: null, reviewId: null })
      setManualInput("")
      await fetchData()
    } catch (error) {
      console.error("Failed to submit manual input:", error)
    } finally {
      setActionLoading(null)
    }
  }

  // Standard approve/reject handlers
  async function handleApprove(taskId: string) {
    if (!supabase) return
    setActionLoading(taskId)
    
    try {
      await supabase
        .from("tasks")
        .update({ status: "pending" })
        .eq("id", taskId)
      
      await fetchData()
    } catch (error) {
      console.error("Failed to approve:", error)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(taskId: string) {
    if (!supabase) return
    setActionLoading(taskId)
    
    try {
      await supabase
        .from("tasks")
        .update({ status: "cancelled" })
        .eq("id", taskId)
      
      await fetchData()
    } catch (error) {
      console.error("Failed to reject:", error)
    } finally {
      setActionLoading(null)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Human Reviews</h1>
        <p className="text-muted-foreground">Approve or reject agent actions requiring human oversight</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Reviews ({pendingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingTasks.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No tasks awaiting review</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingTasks.map((task) => {
                    const isParallel = isParallelTaskFailure(task)
                    const review = getReviewForTask(task.id)
                    const errorMsg = isParallel ? getErrorFromReview(review) : null
                    const isLoading = actionLoading === task.id
                    
                    return (
                      <div 
                        key={task.id} 
                        className={`p-4 rounded-md border ${isParallel ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isParallel && (
                                <GitBranch className="h-4 w-4 text-amber-500" />
                              )}
                              <p className="font-mono text-sm" data-testid={`text-pending-task-${task.id}`}>
                                {task.id.slice(0, 8)}...
                              </p>
                              {isParallel && (
                                <Badge variant="outline" className="text-amber-600 border-amber-500">
                                  Parallel Task
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Agent: {task.agent_slug || "Unknown"}
                            </p>
                            {isParallel && errorMsg && (
                              <div className="mt-2 p-2 bg-red-500/10 rounded text-sm text-red-600 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{errorMsg}</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            {isParallel ? (
                              <>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleRetry(task.id, review?.id || null)}
                                  disabled={isLoading}
                                  data-testid={`button-retry-${task.id}`}
                                >
                                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                  Retry
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setManualInputDialog({ 
                                    open: true, 
                                    taskId: task.id, 
                                    reviewId: review?.id || null 
                                  })}
                                  disabled={isLoading}
                                  data-testid={`button-manual-${task.id}`}
                                >
                                  <Edit3 className="h-4 w-4" />
                                  Manual
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => handleAbort(task.id, review?.id || null)}
                                  disabled={isLoading}
                                  data-testid={`button-abort-${task.id}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                  Abort
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => handleReject(task.id)}
                                  disabled={isLoading}
                                  data-testid={`button-reject-${task.id}`}
                                >
                                  <XCircle className="h-4 w-4 text-red-500" />
                                  Reject
                                </Button>
                                <Button 
                                  size="sm"
                                  onClick={() => handleApprove(task.id)}
                                  disabled={isLoading}
                                  data-testid={`button-approve-${task.id}`}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  Approve
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review History</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No review history</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="flex items-center gap-4 p-3 rounded-md border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {review.approved ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : review.approved === false ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-amber-500" />
                          )}
                          <span className="font-mono text-sm" data-testid={`text-review-${review.id}`}>
                            {review.task_id?.slice(0, 8) || "Unknown"}...
                          </span>
                          {review.approved !== null && (
                            <Badge variant={review.approved ? "default" : "destructive"}>
                              {review.approved ? "Approved" : "Rejected"}
                            </Badge>
                          )}
                          {(review.response as ParallelReviewResponse)?.is_parallel_task && (
                            <Badge variant="outline" className="text-amber-600">
                              <GitBranch className="h-3 w-3 mr-1" />
                              Parallel
                            </Badge>
                          )}
                        </div>
                        {review.comments && (
                          <p className="text-sm text-muted-foreground mt-1">{review.comments}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {review.created_at && formatDistanceToNow(new Date(review.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Manual Input Dialog */}
      <Dialog open={manualInputDialog.open} onOpenChange={(open) => {
        if (!open) {
          setManualInputDialog({ open: false, taskId: null, reviewId: null })
          setManualInput("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide Manual Output</DialogTitle>
            <DialogDescription>
              Enter the output that should be used for this failed parallel task.
              This will mark the task as completed and allow the aggregator to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="manual-output">Output</Label>
            <Input
              id="manual-output"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter the task output..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setManualInputDialog({ open: false, taskId: null, reviewId: null })
                setManualInput("")
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleManualSubmit}
              disabled={!manualInput.trim() || actionLoading === manualInputDialog.taskId}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
