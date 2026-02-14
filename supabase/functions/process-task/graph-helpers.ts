// Graph edge creation helpers for context graphs
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface GraphEdgeParams {
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: 'executes' | 'spawns' | 'handoff' | 'depends_on' | 'uses_tool' | 'has_skill';
  metadata?: Record<string, unknown>;
}

/**
 * Get the graph_node_id for a task
 */
export async function getTaskGraphNodeId(
  supabase: SupabaseClient,
  taskId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("graph_node_id")
    .eq("id", taskId)
    .single();

  if (error || !data) {
    console.log("[GRAPH] Failed to get graph_node_id for task", { taskId, error: error?.message });
    return null;
  }

  return data.graph_node_id;
}

/**
 * Get the graph_node_id for a tool
 */
export async function getToolGraphNodeId(
  supabase: SupabaseClient,
  toolId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tools")
    .select("graph_node_id")
    .eq("id", toolId)
    .single();

  if (error || !data) {
    console.log("[GRAPH] Failed to get graph_node_id for tool", { toolId, error: error?.message });
    return null;
  }

  return data.graph_node_id;
}

/**
 * Get the graph_node_id for an agent
 */
export async function getAgentGraphNodeId(
  supabase: SupabaseClient,
  agentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("graph_node_id")
    .eq("id", agentId)
    .single();

  if (error || !data) {
    console.log("[GRAPH] Failed to get graph_node_id for agent", { agentId, error: error?.message });
    return null;
  }

  return data.graph_node_id;
}

/**
 * Create a graph edge between two nodes
 */
export async function createGraphEdge(
  supabase: SupabaseClient,
  params: GraphEdgeParams
): Promise<string | null> {
  const { sourceNodeId, targetNodeId, edgeType, metadata = {} } = params;

  if (!sourceNodeId || !targetNodeId) {
    console.log("[GRAPH] Cannot create edge - missing node IDs", { sourceNodeId, targetNodeId });
    return null;
  }

  const { data, error } = await supabase
    .from("graph_edges")
    .insert({
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      edge_type: edgeType,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[GRAPH] Failed to create edge", { error: error.message, params });
    return null;
  }

  console.log("[GRAPH] Edge created", {
    edgeId: data.id,
    edgeType,
    source: sourceNodeId.slice(0, 8),
    target: targetNodeId.slice(0, 8),
  });

  return data.id;
}

/**
 * Create a handoff edge between two tasks
 */
export async function createHandoffEdge(
  supabase: SupabaseClient,
  sourceTaskId: string,
  targetTaskId: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sourceNodeId = await getTaskGraphNodeId(supabase, sourceTaskId);
  const targetNodeId = await getTaskGraphNodeId(supabase, targetTaskId);

  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return createGraphEdge(supabase, {
    sourceNodeId,
    targetNodeId,
    edgeType: 'handoff',
    metadata: {
      source_task_id: sourceTaskId,
      target_task_id: targetTaskId,
      ...metadata,
    },
  });
}

/**
 * Create a spawn edge between parent and child task
 */
export async function createSpawnEdge(
  supabase: SupabaseClient,
  parentTaskId: string,
  childTaskId: string,
  isParallel: boolean = false,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sourceNodeId = await getTaskGraphNodeId(supabase, parentTaskId);
  const targetNodeId = await getTaskGraphNodeId(supabase, childTaskId);

  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return createGraphEdge(supabase, {
    sourceNodeId,
    targetNodeId,
    edgeType: 'spawns',
    metadata: {
      parent_task_id: parentTaskId,
      child_task_id: childTaskId,
      is_parallel: isParallel,
      ...metadata,
    },
  });
}

/**
 * Create a depends_on edge for aggregator tasks
 */
export async function createDependsOnEdge(
  supabase: SupabaseClient,
  aggregatorTaskId: string,
  dependentTaskId: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sourceNodeId = await getTaskGraphNodeId(supabase, aggregatorTaskId);
  const targetNodeId = await getTaskGraphNodeId(supabase, dependentTaskId);

  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return createGraphEdge(supabase, {
    sourceNodeId,
    targetNodeId,
    edgeType: 'depends_on',
    metadata: {
      aggregator_task_id: aggregatorTaskId,
      dependent_task_id: dependentTaskId,
      ...metadata,
    },
  });
}

/**
 * Create a uses_tool edge between a task and a tool
 */
export async function createUsesToolEdge(
  supabase: SupabaseClient,
  taskId: string,
  toolId: string,
  toolName: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sourceNodeId = await getTaskGraphNodeId(supabase, taskId);
  const targetNodeId = await getToolGraphNodeId(supabase, toolId);

  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return createGraphEdge(supabase, {
    sourceNodeId,
    targetNodeId,
    edgeType: 'uses_tool',
    metadata: {
      task_id: taskId,
      tool_id: toolId,
      tool_name: toolName,
      ...metadata,
    },
  });
}

/**
 * Create an executes edge between an agent and a task
 */
export async function createExecutesEdge(
  supabase: SupabaseClient,
  agentId: string,
  taskId: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const sourceNodeId = await getAgentGraphNodeId(supabase, agentId);
  const targetNodeId = await getTaskGraphNodeId(supabase, taskId);

  if (!sourceNodeId || !targetNodeId) {
    return null;
  }

  return createGraphEdge(supabase, {
    sourceNodeId,
    targetNodeId,
    edgeType: 'executes',
    metadata: {
      agent_id: agentId,
      task_id: taskId,
      ...metadata,
    },
  });
}
