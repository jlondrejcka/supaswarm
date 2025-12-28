"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import type { HumanReview, Task } from "@/lib/supabase-types"
import { CheckCircle, XCircle, Clock, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ReviewWithTask extends HumanReview {
  task?: Task
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewWithTask[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
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

    fetchData()
  }, [])

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
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-4 p-3 rounded-md border">
                      <div className="flex-1">
                        <p className="font-mono text-sm" data-testid={`text-pending-task-${task.id}`}>
                          {task.id.slice(0, 8)}...
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Agent: {task.agent_slug || "Unknown"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" data-testid={`button-reject-${task.id}`}>
                          <XCircle className="h-4 w-4 text-red-500" />
                          Reject
                        </Button>
                        <Button size="sm" data-testid={`button-approve-${task.id}`}>
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))}
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
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="font-mono text-sm" data-testid={`text-review-${review.id}`}>
                            {review.task_id?.slice(0, 8) || "Unknown"}...
                          </span>
                          <Badge variant={review.approved ? "default" : "destructive"}>
                            {review.approved ? "Approved" : "Rejected"}
                          </Badge>
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
    </div>
  )
}
