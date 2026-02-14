"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import Link from "next/link"

interface ApprovalRequest {
  id: string
  agent_id: string | null
  task_id: string | null
  session_id: string | null
  action_type: string
  resource_table: string
  resource_id: string
  status: "pending" | "approved" | "rejected"
  payload: any
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  agents?: { name: string; slug: string } | null
  tasks?: { id: string; status: string } | null
  sessions?: { id: string; display_name: string } | null
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">(
    "pending"
  )

  const fetchApprovals = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const query = supabase.from("approval_requests").select(`
        id,
        agent_id,
        task_id,
        session_id,
        action_type,
        resource_table,
        resource_id,
        status,
        payload,
        created_at,
        reviewed_by,
        reviewed_at,
        review_notes,
        agents(name, slug),
        tasks(id, status),
        sessions(id, display_name)
      `)

      if (filter !== "all") {
        query.eq("status", filter)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error
      setApprovals((data || []) as ApprovalRequest[])
    } catch (error) {
      console.error("Failed to fetch approvals:", error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      approved: "default",
      rejected: "destructive"
    }
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    )
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">Approvals</h1>
            <p className="text-muted-foreground">Pending requests requiring review</p>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            size="sm"
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Approvals List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : approvals.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No approval requests found
              </p>
            </CardContent>
          </Card>
        ) : (
          approvals.map(approval => (
            <Card key={approval.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(approval.status)}
                      <span className="text-sm font-medium">{approval.action_type}</span>
                      {getStatusBadge(approval.status)}
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">
                      <strong>Resource:</strong> {approval.resource_table} ({approval.resource_id.slice(0, 8)})
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-3">
                      {approval.agents && (
                        <div>
                          <p className="text-muted-foreground">Agent</p>
                          <p className="font-medium">{approval.agents.name}</p>
                        </div>
                      )}
                      {approval.tasks && (
                        <div>
                          <p className="text-muted-foreground">Task</p>
                          <p className="font-medium">{approval.tasks.id.slice(0, 8)}...</p>
                        </div>
                      )}
                      {approval.sessions && (
                        <div>
                          <p className="text-muted-foreground">Session</p>
                          <p className="font-medium">{approval.sessions.display_name}</p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Created {new Date(approval.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <Link href={`/approvals/${approval.id}`}>
                      <Button size="sm" variant="default">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
