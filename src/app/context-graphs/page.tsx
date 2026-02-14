"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import { RefreshCw, Network, Brain, ChevronDown, ChevronUp, Clock, Users, MessageCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface ContextStory {
  id: string
  master_task_id: string
  is_strategic: boolean
  headline: string | null
  summary: string | null
  full_transcript: string | null
  objective: string | null
  current_state: string | null
  key_facts: string[]
  agents_involved: string[]
  turn_count: number
  last_turn_at: string | null
  created_at: string
  updated_at: string
}

interface GraphStats {
  total_nodes: number
  total_edges: number
  nodes_by_type: Record<string, number>
  edges_by_type: Record<string, number>
}

export default function ContextGraphsPage() {
  const [stories, setStories] = useState<ContextStory[]>([])
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "strategic" | "ops">("all")
  const [expandedStory, setExpandedStory] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    setLoading(true)
    try {
      // Fetch context stories
      const { data: storiesData, error: storiesError } = await supabase
        .from("context_stories")
        .select("*")
        .order("updated_at", { ascending: false })

      if (storiesError) throw storiesError
      setStories(storiesData || [])

      // Fetch graph stats
      const [nodesResult, edgesResult] = await Promise.all([
        supabase.from("graph_nodes").select("entity_type"),
        supabase.from("graph_edges").select("edge_type"),
      ])

      const nodes = nodesResult.data || []
      const edges = edgesResult.data || []

      const nodesByType = nodes.reduce((acc, n) => {
        acc[n.entity_type] = (acc[n.entity_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const edgesByType = edges.reduce((acc, e) => {
        acc[e.edge_type] = (acc[e.edge_type] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      setStats({
        total_nodes: nodes.length,
        total_edges: edges.length,
        nodes_by_type: nodesByType,
        edges_by_type: edgesByType,
      })
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const filteredStories = stories.filter(s => {
    if (filter === "all") return true
    if (filter === "strategic") return s.is_strategic
    return !s.is_strategic
  })

  const strategicCount = stories.filter(s => s.is_strategic).length
  const opsCount = stories.filter(s => !s.is_strategic).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            Context Graphs
          </h1>
          <p className="text-muted-foreground">Conversation summaries and relationship graphs</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total_nodes}</div>
              <p className="text-sm text-muted-foreground">Graph Nodes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total_edges}</div>
              <p className="text-sm text-muted-foreground">Graph Edges</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stories.length}</div>
              <p className="text-sm text-muted-foreground">Context Stories</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {stories.reduce((sum, s) => sum + s.turn_count, 0)}
              </div>
              <p className="text-sm text-muted-foreground">Total Turns</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Graph Type Breakdown */}
      {!loading && stats && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Nodes by Type</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.nodes_by_type).map(([type, count]) => (
                  <Badge key={type} variant="secondary">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Edges by Type</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.edges_by_type).map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Context Stories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Context Stories
          </h2>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All ({stories.length})</TabsTrigger>
              <TabsTrigger value="strategic">Strategic ({strategicCount})</TabsTrigger>
              <TabsTrigger value="ops">Ops ({opsCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredStories.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No context stories yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Stories are created automatically when conversations complete
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredStories.map((story) => {
              const isExpanded = expandedStory === story.id
              return (
                <Card key={story.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div 
                      className="p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => setExpandedStory(isExpanded ? null : story.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {story.is_strategic && (
                              <Badge variant="default" className="text-xs">Strategic</Badge>
                            )}
                            <span className="font-medium line-clamp-1">
                              {story.headline || "Untitled conversation"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {story.objective || story.summary?.slice(0, 150) || "No summary available"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1" title="Turn count">
                            <MessageCircle className="h-4 w-4" />
                            {story.turn_count}
                          </div>
                          <div className="flex items-center gap-1" title="Agents involved">
                            <Users className="h-4 w-4" />
                            {story.agents_involved?.length || 0}
                          </div>
                          <div className="flex items-center gap-1" title="Last activity">
                            <Clock className="h-4 w-4" />
                            {story.last_turn_at 
                              ? formatDistanceToNow(new Date(story.last_turn_at), { addSuffix: true })
                              : "Never"
                            }
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t p-4 space-y-4 bg-muted/30">
                        {story.current_state && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Current State</h4>
                            <p className="text-sm text-muted-foreground">{story.current_state}</p>
                          </div>
                        )}
                        
                        {story.summary && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Summary</h4>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {story.summary}
                            </p>
                          </div>
                        )}

                        {story.key_facts && story.key_facts.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Key Facts</h4>
                            <ul className="list-disc list-inside text-sm text-muted-foreground">
                              {story.key_facts.map((fact, i) => (
                                <li key={i}>{fact}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {story.agents_involved && story.agents_involved.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">Agents Involved</h4>
                            <div className="flex flex-wrap gap-1">
                              {story.agents_involved.map((agent, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {agent}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t">
                          <span>Task: {story.master_task_id.slice(0, 8)}</span>
                          <span>Created: {formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
