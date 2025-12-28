"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Tool, ToolType } from "@/lib/supabase-types"
import { Plus, Wrench, Globe, Server, Database } from "lucide-react"

const toolTypeIcons: Record<ToolType, typeof Wrench> = {
  internal: Wrench,
  mcp_server: Server,
  http_api: Globe,
  supabase_rpc: Database
}

const toolTypeLabels: Record<ToolType, string> = {
  internal: "Internal",
  mcp_server: "MCP Server",
  http_api: "HTTP API",
  supabase_rpc: "Supabase RPC"
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTools() {
      if (!supabase) {
        setLoading(false)
        return
      }
      
      try {
        const { data, error } = await supabase
          .from("tools")
          .select("*")
          .order("created_at", { ascending: false })

        if (error) throw error
        setTools(data || [])
      } catch (error) {
        console.error("Failed to fetch tools:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTools()
  }, [])

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Tools</h1>
          <p className="text-muted-foreground">Manage MCP servers, HTTP APIs, and integrations</p>
        </div>
        <Button size="sm" data-testid="button-create-tool">
          <Plus className="h-4 w-4" />
          Add Tool
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No tools configured yet</p>
            <Button className="mt-4" data-testid="button-create-first-tool">
              <Plus className="h-4 w-4" />
              Add Your First Tool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = toolTypeIcons[tool.type as ToolType] || Wrench
            return (
              <Card key={tool.id} className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base" data-testid={`text-tool-name-${tool.id}`}>
                        {tool.name}
                      </CardTitle>
                    </div>
                    <Badge variant={tool.is_active ? "default" : "secondary"}>
                      {tool.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {tool.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {toolTypeLabels[tool.type as ToolType] || tool.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{tool.slug}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
