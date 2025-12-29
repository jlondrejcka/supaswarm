"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Tool, ToolType } from "@/lib/supabase-types"
import { Plus, Wrench, Globe, Server, Database, Save } from "lucide-react"

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    type: "mcp_server" as ToolType,
    config: "{}",
  })

  useEffect(() => {
    fetchTools()
  }, [])

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

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  function openCreateDialog() {
    setEditingTool(null)
    setFormData({
      name: "",
      slug: "",
      description: "",
      type: "mcp_server",
      config: "{}",
    })
    setDialogOpen(true)
  }

  function openEditDialog(tool: Tool) {
    setEditingTool(tool)
    setFormData({
      name: tool.name,
      slug: tool.slug,
      description: tool.description || "",
      type: tool.type as ToolType,
      config: JSON.stringify(tool.config, null, 2),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!supabase) return

    setSaving(true)
    try {
      let configJson = {}
      try {
        configJson = JSON.parse(formData.config)
      } catch {
        configJson = {}
      }

      const payload = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description || null,
        type: formData.type,
        config: configJson,
        is_active: true,
      }

      if (editingTool) {
        const { error } = await supabase
          .from("tools")
          .update(payload)
          .eq("id", editingTool.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("tools")
          .insert(payload)
        if (error) throw error
      }

      await fetchTools()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to save tool:", error)
    } finally {
      setSaving(false)
    }
  }

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
        <Button size="sm" onClick={openCreateDialog} data-testid="button-create-tool">
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
            <Button className="mt-4" onClick={openCreateDialog} data-testid="button-create-first-tool">
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
              <Card key={tool.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openEditDialog(tool)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTool ? "Edit Tool" : "Add New Tool"}</DialogTitle>
            <DialogDescription>
              {editingTool ? "Update the tool configuration" : "Configure a new tool for agents to use"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      name: e.target.value,
                      slug: editingTool ? formData.slug : generateSlug(e.target.value)
                    })
                  }}
                  placeholder="My Tool"
                  data-testid="input-tool-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="my-tool"
                  data-testid="input-tool-slug"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tool Type *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as ToolType })}>
                <SelectTrigger data-testid="select-tool-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcp_server">MCP Server</SelectItem>
                  <SelectItem value="http_api">HTTP API</SelectItem>
                  <SelectItem value="supabase_rpc">Supabase RPC</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this tool do?"
                data-testid="input-tool-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config">Configuration (JSON)</Label>
              <textarea
                id="config"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                placeholder='{"endpoint": "https://..."}'
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-tool-config"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name} data-testid="button-save">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : editingTool ? "Update Tool" : "Add Tool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
