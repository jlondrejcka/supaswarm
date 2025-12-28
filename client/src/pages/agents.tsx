import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/queryClient"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
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
  Bot, 
  Plus, 
  Search,
  Pencil,
  Trash2,
  Wrench,
  Sparkles,
  MoreVertical
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Agent, LLMProvider, Tool, Skill } from "@/lib/supabase-types"

const agentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  system_prompt: z.string().min(1, "System prompt is required"),
  provider_id: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().optional(),
  is_active: z.boolean().default(true),
})

type AgentFormData = z.infer<typeof agentSchema>

export default function Agents() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null)
  const { toast } = useToast()

  const form = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      system_prompt: "",
      temperature: 0.7,
      is_active: true,
    },
  })

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Agent[]
    }
  })

  const { data: providers } = useQuery({
    queryKey: ['llm_providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('llm_providers')
        .select('*')
        .eq('is_active', true)
      if (error) throw error
      return data as LLMProvider[]
    }
  })

  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tools').select('*')
      if (error) throw error
      return data as Tool[]
    }
  })

  const { data: skills } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data, error } = await supabase.from('skills').select('*')
      if (error) throw error
      return data as Skill[]
    }
  })

  const { data: agentTools } = useQuery({
    queryKey: ['agent_tools'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_tools').select('*')
      if (error) throw error
      return data
    }
  })

  const { data: agentSkills } = useQuery({
    queryKey: ['agent_skills'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_skills').select('*')
      if (error) throw error
      return data
    }
  })

  const createMutation = useMutation({
    mutationFn: async (data: AgentFormData) => {
      const { error } = await supabase.from('agents').insert([data])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      toast({ title: "Agent created successfully" })
      setIsDialogOpen(false)
      form.reset()
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" })
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AgentFormData }) => {
      const { error } = await supabase
        .from('agents')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      toast({ title: "Agent updated successfully" })
      setIsDialogOpen(false)
      setEditingAgent(null)
      form.reset()
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update agent", description: error.message, variant: "destructive" })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      toast({ title: "Agent deleted successfully" })
      setDeletingAgent(null)
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" })
    }
  })

  const filteredAgents = agents?.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.slug.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const openCreateDialog = () => {
    setEditingAgent(null)
    form.reset({
      name: "",
      slug: "",
      description: "",
      system_prompt: "",
      temperature: 0.7,
      is_active: true,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (agent: Agent) => {
    setEditingAgent(agent)
    form.reset({
      name: agent.name,
      slug: agent.slug,
      description: agent.description || "",
      system_prompt: agent.system_prompt,
      provider_id: agent.provider_id || undefined,
      model: agent.model || undefined,
      temperature: agent.temperature || 0.7,
      max_tokens: agent.max_tokens || undefined,
      is_active: agent.is_active ?? true,
    })
    setIsDialogOpen(true)
  }

  const onSubmit = (data: AgentFormData) => {
    if (editingAgent) {
      updateMutation.mutate({ id: editingAgent.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const getAgentToolCount = (agentId: string) => 
    agentTools?.filter(at => at.agent_id === agentId).length || 0
  
  const getAgentSkillCount = (agentId: string) => 
    agentSkills?.filter(as => as.agent_id === agentId).length || 0

  const getProviderName = (providerId: string | null) =>
    providerId ? providers?.find(p => p.id === providerId)?.display_name : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        description="Configure and manage your AI agents"
        actionLabel="New Agent"
        onAction={openCreateDialog}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 max-w-md"
          data-testid="input-search-agents"
        />
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
      ) : filteredAgents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents found"
          description="Create your first agent to start building workflows."
          actionLabel="Create Agent"
          onAction={openCreateDialog}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map(agent => (
            <Card key={agent.id} className="hover-elevate" data-testid={`agent-card-${agent.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                      <code className="text-xs text-muted-foreground font-mono">{agent.slug}</code>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-agent-menu-${agent.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(agent)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeletingAgent(agent)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {agent.description && (
                  <CardDescription className="line-clamp-2 mt-2">
                    {agent.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  {!agent.is_active && (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {getProviderName(agent.provider_id) && (
                    <Badge variant="outline">{getProviderName(agent.provider_id)}</Badge>
                  )}
                  {agent.model && (
                    <Badge variant="outline" className="font-mono text-xs">{agent.model}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    <span>{getAgentToolCount(agent.id)} tools</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>{getAgentSkillCount(agent.id)} skills</span>
                  </div>
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
              {editingAgent ? "Edit Agent" : "Create Agent"}
            </DialogTitle>
            <DialogDescription>
              Configure your agent's behavior and capabilities.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="My Agent"
                  data-testid="input-agent-name"
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
                  placeholder="my-agent"
                  data-testid="input-agent-slug"
                />
                {form.formState.errors.slug && (
                  <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                {...form.register("description")}
                placeholder="What does this agent do?"
                data-testid="input-agent-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="system_prompt">System Prompt</Label>
              <Textarea
                id="system_prompt"
                {...form.register("system_prompt")}
                placeholder="You are a helpful assistant..."
                className="min-h-[120px]"
                data-testid="textarea-agent-prompt"
              />
              {form.formState.errors.system_prompt && (
                <p className="text-xs text-destructive">{form.formState.errors.system_prompt.message}</p>
              )}
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label>LLM Provider</Label>
                <Select
                  value={form.watch("provider_id") || ""}
                  onValueChange={(value) => form.setValue("provider_id", value || undefined)}
                >
                  <SelectTrigger data-testid="select-agent-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers?.map(provider => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  {...form.register("model")}
                  placeholder="gpt-4o"
                  data-testid="input-agent-model"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Temperature: {form.watch("temperature")}</Label>
              <Slider
                value={[form.watch("temperature") || 0.7]}
                onValueChange={([value]) => form.setValue("temperature", value)}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
                data-testid="slider-agent-temperature"
              />
              <p className="text-xs text-muted-foreground">
                Lower values are more focused, higher values are more creative.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) => form.setValue("is_active", checked)}
                data-testid="switch-agent-active"
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
                data-testid="button-save-agent"
              >
                {editingAgent ? "Save Changes" : "Create Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingAgent} onOpenChange={() => setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingAgent?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingAgent && deleteMutation.mutate(deletingAgent.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
