import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/queryClient"
import { PageHeader } from "@/components/page-header"
import { ToolTypeBadge } from "@/components/tool-type-badge"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { 
  Wrench, 
  Search,
  Pencil,
  Trash2,
  MoreVertical,
  Key
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Tool, ToolType, CredentialType } from "@/lib/supabase-types"

const toolSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9_]+$/, "Slug must be lowercase letters, numbers, and underscores"),
  type: z.enum(['internal', 'mcp_server', 'http_api', 'supabase_rpc']),
  description: z.string().optional(),
  config: z.string().default('{}'),
  credential_type: z.enum(['api_key', 'bearer_token', 'oauth_refresh_token', 'none']).optional(),
  credential_secret_name: z.string().optional(),
  credential_description: z.string().optional(),
  is_active: z.boolean().default(true),
})

type ToolFormData = z.infer<typeof toolSchema>

const toolTypes: { value: ToolType; label: string }[] = [
  { value: 'internal', label: 'Internal' },
  { value: 'mcp_server', label: 'MCP Server' },
  { value: 'http_api', label: 'HTTP API' },
  { value: 'supabase_rpc', label: 'Supabase RPC' },
]

const credentialTypes: { value: CredentialType; label: string }[] = [
  { value: 'none', label: 'No Credentials' },
  { value: 'api_key', label: 'API Key' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'oauth_refresh_token', label: 'OAuth Token' },
]

export default function Tools() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [deletingTool, setDeletingTool] = useState<Tool | null>(null)
  const { toast } = useToast()

  const form = useForm<ToolFormData>({
    resolver: zodResolver(toolSchema),
    defaultValues: {
      name: "",
      slug: "",
      type: "internal",
      description: "",
      config: "{}",
      credential_type: "none",
      is_active: true,
    },
  })

  const { data: tools, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Tool[]
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      const toolData = {
        ...data,
        config: JSON.parse(data.config),
      }
      const { error } = await supabase.from('tools').insert([toolData])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      toast({ title: "Tool created successfully" })
      setIsDialogOpen(false)
      form.reset()
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create tool", description: error.message, variant: "destructive" })
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ToolFormData }) => {
      const toolData = {
        ...data,
        config: JSON.parse(data.config),
      }
      const { error } = await supabase
        .from('tools')
        .update(toolData)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      toast({ title: "Tool updated successfully" })
      setIsDialogOpen(false)
      setEditingTool(null)
      form.reset()
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update tool", description: error.message, variant: "destructive" })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tools').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] })
      toast({ title: "Tool deleted successfully" })
      setDeletingTool(null)
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete tool", description: error.message, variant: "destructive" })
    }
  })

  const filteredTools = tools?.filter(tool => {
    const matchesSearch = 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.slug.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = typeFilter === "all" || tool.type === typeFilter
    return matchesSearch && matchesType
  }) || []

  const openCreateDialog = () => {
    setEditingTool(null)
    form.reset({
      name: "",
      slug: "",
      type: "internal",
      description: "",
      config: "{}",
      credential_type: "none",
      is_active: true,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (tool: Tool) => {
    setEditingTool(tool)
    form.reset({
      name: tool.name,
      slug: tool.slug,
      type: tool.type as ToolType,
      description: tool.description || "",
      config: JSON.stringify(tool.config, null, 2),
      credential_type: (tool.credential_type as CredentialType) || "none",
      credential_secret_name: tool.credential_secret_name || "",
      credential_description: tool.credential_description || "",
      is_active: tool.is_active ?? true,
    })
    setIsDialogOpen(true)
  }

  const onSubmit = (data: ToolFormData) => {
    try {
      JSON.parse(data.config)
    } catch {
      toast({ title: "Invalid JSON in config", variant: "destructive" })
      return
    }
    
    if (editingTool) {
      updateMutation.mutate({ id: editingTool.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tools"
        description="Manage internal tools and external integrations"
        actionLabel="New Tool"
        onAction={openCreateDialog}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-tools"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-type-filter">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {toolTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No tools found"
          description="Add tools to extend your agents' capabilities."
          actionLabel="Create Tool"
          onAction={openCreateDialog}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map(tool => (
            <Card key={tool.id} className="hover-elevate" data-testid={`tool-card-${tool.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{tool.name}</CardTitle>
                      <code className="text-xs text-muted-foreground font-mono">{tool.slug}</code>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-tool-menu-${tool.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(tool)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeletingTool(tool)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {tool.description && (
                  <CardDescription className="line-clamp-2 mt-2">
                    {tool.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <ToolTypeBadge type={tool.type as ToolType} />
                  {!tool.is_active && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {tool.credential_type && tool.credential_type !== 'none' && (
                    <Badge variant="outline" className="gap-1">
                      <Key className="h-3 w-3" />
                      {tool.credential_type.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTool ? "Edit Tool" : "Create Tool"}
            </DialogTitle>
            <DialogDescription>
              Configure tool settings and authentication.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Web Search"
                  data-testid="input-tool-name"
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  {...form.register("slug")}
                  placeholder="web_search"
                  data-testid="input-tool-slug"
                />
                {form.formState.errors.slug && (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.watch("type")}
                  onValueChange={(value) => form.setValue("type", value as ToolType)}
                >
                  <SelectTrigger data-testid="select-tool-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {toolTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Credential Type</Label>
                <Select
                  value={form.watch("credential_type") || "none"}
                  onValueChange={(value) => form.setValue("credential_type", value as CredentialType)}
                >
                  <SelectTrigger data-testid="select-credential-type">
                    <SelectValue placeholder="Select credential type" />
                  </SelectTrigger>
                  <SelectContent>
                    {credentialTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                {...form.register("description")}
                placeholder="What does this tool do?"
                data-testid="input-tool-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="config">Configuration (JSON)</Label>
              <Textarea
                id="config"
                {...form.register("config")}
                placeholder='{"mcp_url": "https://..."}'
                className="min-h-[100px] font-mono text-sm"
                data-testid="textarea-tool-config"
              />
            </div>

            {form.watch("credential_type") !== "none" && (
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="credential_secret_name">Vault Secret Name</Label>
                  <Input
                    id="credential_secret_name"
                    {...form.register("credential_secret_name")}
                    placeholder="MY_API_KEY"
                    data-testid="input-credential-secret"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credential_description">Credential Description</Label>
                  <Input
                    id="credential_description"
                    {...form.register("credential_description")}
                    placeholder="API key for service X"
                    data-testid="input-credential-description"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) => form.setValue("is_active", checked)}
                data-testid="switch-tool-active"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-tool"
              >
                {editingTool ? "Save Changes" : "Create Tool"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTool} onOpenChange={() => setDeletingTool(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTool?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTool && deleteMutation.mutate(deletingTool.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-tool"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
