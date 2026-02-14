"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle, XCircle, Clock, ChevronLeft } from "lucide-react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import Link from "next/link"
import { useParams } from "next/navigation"

interface ApprovalRequest {
  id: string
  agent_id: string | null
  task_id: string | null
  session_id: string | null
  action_type: string
  resource_table: string
  resource_id: string
  payload: any
  status: "pending" | "approved" | "rejected"
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  agents?: { name: string; slug: string; system_prompt: string } | null
  tasks?: { id: string; status: string; agent_slug: string } | null
  sessions?: { id: string; display_name: string; status: string } | null
}

export default function ApprovalDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [approval, setApproval] = useState<ApprovalRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reviewNotes, setReviewNotes] = useState("")

  useEffect(() => {
    const fetchApproval = async () => {
      if (!supabase || !id) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data, error } = await supabase
          .from("approval_requests")
          .select(
            `
            id,
            agent_id,
            task_id,
            session_id,
            action_type,
            resource_table,
            resource_id,
            payload,
            status,
            created_at,
            reviewed_by,
            reviewed_at,
            review_notes,
            agents(name, slug, system_prompt),
            tasks(id, status, agent_slug),
            sessions(id, display_name, status)
          `
          )
          .eq("id", id)
          .single()

        if (error) throw error
        setApproval(data as ApprovalRequest)
        if (data.review_notes) setReviewNotes(data.review_notes)
      } catch (error) {
        console.error("Failed to fetch approval:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchApproval()
  }, [id])

  const handleReview = async (approved: boolean) => {
    if (!supabase || !approval || approval.status !== "pending") return

    try {
      setSubmitting(true)
      const { error } = await supabase
        .from("approval_requests")
        .update({
          status: approved ? "approved" : "rejected",
          reviewed_by: "user",
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null
        })
        .eq("id", approval.id)

      if (error) throw error

      setApproval({
        ...approval,
        status: approved ? "approved" : "rejected",
        reviewed_by: "user",
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null
      })
    } catch (error) {
      console.error("Failed to review approval:", error)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  if (!approval) {
    return <div className="p-6 text-center text-destructive">Approval not found</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Link */}
      <Link href="/approvals" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to Approvals
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{approval.action_type}</h1>
          <p className="text-muted-foreground">{approval.resource_table} · {approval.id.slice(0, 8)}</p>
        </div>
        <Badge
          variant={
            approval.status === "pending"
              ? "outline"
              : approval.status === "approved"
              ? "default"
              : "destructive"
          }
          className="text-lg px-3 py-1"
        >
          {approval.status === "pending" && <Clock className="h-4 w-4 mr-1" />}
          {approval.status === "approved" && <CheckCircle className="h-4 w-4 mr-1" />}
          {approval.status === "rejected" && <XCircle className="h-4 w-4 mr-1" />}
          {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
        </Badge>
      </div>

      {/* Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {approval.agents && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{approval.agents.name}</p>
              <p className="text-xs text-muted-foreground">{approval.agents.slug}</p>
            </CardContent>
          </Card>
        )}

        {approval.tasks && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Task</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{approval.tasks.id.slice(0, 8)}...</p>
              <p className="text-xs text-muted-foreground capitalize">{approval.tasks.status}</p>
            </CardContent>
          </Card>
        )}

        {approval.sessions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Session</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{approval.sessions.display_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{approval.sessions.status}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Request Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md overflow-auto max-h-64 text-sm">
            {JSON.stringify(approval.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>

      {/* Review Section */}
      {approval.status === "pending" && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-sm">Review & Decide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Review Notes</label>
              <Textarea
                placeholder="Add any notes for this review..."
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                className="min-h-32"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="destructive"
                onClick={() => handleReview(false)}
                disabled={submitting}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                variant="default"
                onClick={() => handleReview(true)}
                disabled={submitting}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Result */}
      {approval.status !== "pending" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Review Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">Decision:</span>{" "}
              <span className="capitalize">{approval.status}</span>
            </p>
            <p className="text-sm">
              <span className="font-medium">Reviewed by:</span> {approval.reviewed_by}
            </p>
            <p className="text-sm">
              <span className="font-medium">Reviewed at:</span>{" "}
              {approval.reviewed_at && new Date(approval.reviewed_at).toLocaleString()}
            </p>
            {approval.review_notes && (
              <div>
                <p className="text-sm font-medium">Notes:</p>
                <p className="text-sm text-muted-foreground">{approval.review_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
