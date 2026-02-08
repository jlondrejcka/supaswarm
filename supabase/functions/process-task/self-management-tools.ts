import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelfManagementContext {
  supabase: SupabaseClient;
  agentId: string;
  agentSlug: string;
  taskId: string;
  sessionId: string;
}

export interface SelfManagementResult {
  result: string;
  needsApproval?: boolean;
  blocking?: boolean;
}

export const SELF_MANAGEMENT_TOOLS = [
  "manage_soul",
  "manage_memory",
  "manage_crons",
  "manage_agents",
  "manage_skills",
  "manage_tools",
  "manage_code_files",
  "log_activity",
  "notify_agent",
] as const;

// ---------------------------------------------------------------------------
// LLM Tool Definitions (injected for Rick only)
// ---------------------------------------------------------------------------

export const SELF_MANAGEMENT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "manage_soul",
      description: "Manage agent identity/soul entries in the context graph. Get or set aspects like personality, capabilities, values, workflow, communication_style, security_rules, team_context.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "set"], description: "Action to perform" },
          aspect: { type: "string", description: "Soul aspect (personality, capabilities, values, workflow, communication_style, security_rules, team_context)" },
          content: { type: "string", description: "Content for the soul aspect (required for set)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_memory",
      description: "Manage persistent agent memory via context graph. Remember facts, recall by query, pin important nodes, forget, list, or connect related nodes.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["remember", "recall", "pin", "forget", "list", "connect"], description: "Action to perform" },
          name: { type: "string", description: "Node name (for remember, pin, forget, connect)" },
          content: { type: "string", description: "Content text (for remember)" },
          node_type: { type: "string", description: "Node type: person, concept, fact, preference, event, tool, skill, entity, decision" },
          flags: { type: "array", items: { type: "string" }, description: "Flags: principle, preference, lesson, security_rule, delegation_rule, pinned, temporary" },
          query: { type: "string", description: "Search query (for recall)" },
          related_to: { type: "string", description: "Name of related node to connect (for remember)" },
          source_name: { type: "string", description: "Source node name (for connect)" },
          target_name: { type: "string", description: "Target node name (for connect)" },
          edge_type: { type: "string", description: "Edge type (for connect): related_to, depends_on, supports, part_of, similar_to" },
          reason: { type: "string", description: "Reason for pinning (for pin)" },
          limit: { type: "number", description: "Max results (for recall, list)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_crons",
      description: "Manage scheduled cron jobs (heartbeats, task checks, cleanup). Create/update/delete require human approval (async — task continues). List/pause/resume are free.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "delete", "pause", "resume"], description: "Action to perform" },
          cron_id: { type: "string", description: "Cron ID (for update, delete, pause, resume)" },
          cron_name: { type: "string", description: "Cron name (for create)" },
          cron_schedule: { type: "string", description: "Cron schedule expression (for create, update)" },
          cron_type: { type: "string", enum: ["heartbeat", "task_check", "cleanup", "custom"], description: "Cron type" },
          edge_function: { type: "string", description: "Edge function to invoke" },
          payload: { type: "object", description: "Payload JSON for the cron job" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_agents",
      description: "Create or update team member agents. Create/update require human approval (blocking — task suspends). List/get are free. New agents start inactive until approved.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "get"], description: "Action to perform" },
          agent_id: { type: "string", description: "Agent ID (for update, get)" },
          name: { type: "string", description: "Agent name" },
          slug: { type: "string", description: "URL-safe slug" },
          system_prompt: { type: "string", description: "System prompt" },
          model: { type: "string", description: "LLM model name" },
          provider_id: { type: "string", description: "LLM provider ID" },
          description: { type: "string", description: "Agent description" },
          temperature: { type: "number", description: "Temperature (0-2)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_skills",
      description: "CRUD for skills (instruction sets). No approval needed. Can also assign/unassign skills to agents.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "get", "assign", "unassign"], description: "Action to perform" },
          skill_id: { type: "string", description: "Skill ID (for update, get, assign, unassign)" },
          agent_id: { type: "string", description: "Agent ID (for assign, unassign)" },
          name: { type: "string", description: "Skill name" },
          description: { type: "string", description: "Skill description" },
          instructions: { type: "string", description: "Skill instructions" },
          metadata: { type: "object", description: "Skill metadata" },
          version: { type: "string", description: "Skill version" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_tools",
      description: "CRUD for tools. Create/update require human approval (blocking — task suspends). List/get/assign/unassign are free. Spawn tools let agents delegate to other agents — config must include target_agent_id, target_agent_slug, and optionally skill_id, instructions, context_variables.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "list", "update", "get", "assign", "unassign"], description: "Action to perform" },
          tool_id: { type: "string", description: "Tool ID (for update, get, assign, unassign)" },
          agent_id: { type: "string", description: "Agent ID (for assign, unassign)" },
          name: { type: "string", description: "Tool name" },
          slug: { type: "string", description: "URL-safe slug" },
          type: { type: "string", enum: ["mcp_server", "http_api", "supabase_rpc", "internal", "spawn"], description: "Tool type (use spawn for agent delegation)" },
          description: { type: "string", description: "Tool description" },
          config: { type: "object", description: "Tool config. For spawn: {target_agent_id, target_agent_slug, skill_id?, instructions?, context_variables?: [{name,type,required,description}]}" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "manage_code_files",
      description: "Write, read, list code files, or deploy as edge functions. Write/read/list are free. Deploy requires human approval (async — task continues).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["write", "read", "list", "deploy"], description: "Action to perform" },
          file_path: { type: "string", description: "File path (for write, read, deploy)" },
          content: { type: "string", description: "File content (for write)" },
          file_type: { type: "string", enum: ["edge_function", "script", "config", "other"], description: "File type (for write)" },
          function_name: { type: "string", description: "Function name for deployment (for deploy)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "log_activity",
      description: "Log an activity entry or list recent activities.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["log", "list"], description: "Action to perform" },
          activity_type: { type: "string", description: "Activity type (for log): task_updated, agent_created, skill_created, tool_created, heartbeat, delegation, note" },
          message: { type: "string", description: "Activity description (for log)" },
          agent_id: { type: "string", description: "Filter by agent (for list)" },
          limit: { type: "number", description: "Max results (for list)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "notify_agent",
      description: "Send notifications to other agents, list your unread notifications, or mark them read.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["send", "list_mine", "mark_read"], description: "Action to perform" },
          to_agent_id: { type: "string", description: "Target agent ID (for send)" },
          content: { type: "string", description: "Notification content (for send)" },
          notification_ids: { type: "array", items: { type: "string" }, description: "Notification IDs to mark read" },
        },
        required: ["action"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleSelfManagementTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    switch (toolName) {
      case "manage_soul":
        return await handleManageSoul(args, ctx);
      case "manage_memory":
        return await handleManageMemory(args, ctx);
      case "manage_crons":
        return await handleManageCrons(args, ctx);
      case "manage_agents":
        return await handleManageAgents(args, ctx);
      case "manage_skills":
        return await handleManageSkills(args, ctx);
      case "manage_tools":
        return await handleManageTools(args, ctx);
      case "manage_code_files":
        return await handleManageCodeFiles(args, ctx);
      case "log_activity":
        return await handleLogActivity(args, ctx);
      case "notify_agent":
        return await handleNotifyAgent(args, ctx);
      default:
        return { result: `Error: Unknown self-management tool "${toolName}"` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 1. manage_soul  (self-serve)
// ---------------------------------------------------------------------------

const VALID_SOUL_ASPECTS = [
  "personality",
  "capabilities",
  "values",
  "workflow",
  "communication_style",
  "security_rules",
  "team_context",
];

async function handleManageSoul(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    if (action === "get") {
      const { data, error } = await ctx.supabase
        .from("memory_nodes")
        .select("*")
        .eq("agent_id", ctx.agentId)
        .contains("properties", { flags: ["soul"] })
        .order("strength", { ascending: false });

      if (error) return { result: `Error: ${error.message}` };
      return { result: JSON.stringify(data ?? []) };
    }

    if (action === "set") {
      const aspect = args.aspect as string;
      const content = args.content as string;

      if (!aspect || !content) {
        return { result: "Error: 'aspect' and 'content' are required for set" };
      }
      if (!VALID_SOUL_ASPECTS.includes(aspect)) {
        return {
          result: `Error: Invalid aspect "${aspect}". Valid: ${VALID_SOUL_ASPECTS.join(", ")}`,
        };
      }

      const nodeName = `soul:${aspect}`;
      const properties = { flags: ["soul", "pinned"], source: "agent_explicit" };

      // Try to find existing node
      const { data: existing } = await ctx.supabase
        .from("memory_nodes")
        .select("id")
        .eq("agent_id", ctx.agentId)
        .eq("name", nodeName)
        .eq("node_type", "concept")
        .maybeSingle();

      if (existing?.id) {
        const { error } = await ctx.supabase
          .from("memory_nodes")
          .update({ content, properties, strength: 2.0 })
          .eq("id", existing.id);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ updated: nodeName }) };
      }

      const { error } = await ctx.supabase.from("memory_nodes").insert({
        agent_id: ctx.agentId,
        session_id: ctx.sessionId,
        name: nodeName,
        node_type: "concept",
        content,
        properties,
        strength: 2.0,
      });

      if (error) return { result: `Error: ${error.message}` };
      return { result: JSON.stringify({ created: nodeName }) };
    }

    return { result: `Error: Unknown action "${action}" for manage_soul` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 2. manage_memory  (self-serve)
// ---------------------------------------------------------------------------

async function handleManageMemory(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      // ---- remember ----
      case "remember": {
        const name = args.name as string;
        const content = args.content as string;
        const nodeType = (args.node_type as string) || "concept";
        const flags = (args.flags as string[]) || [];
        const relatedTo = args.related_to as string | undefined;

        if (!name || !content) {
          return { result: "Error: 'name' and 'content' are required for remember" };
        }

        const properties = { flags, source: "agent_explicit" };

        // Upsert: select then insert/update
        const { data: existing } = await ctx.supabase
          .from("memory_nodes")
          .select("id")
          .eq("agent_id", ctx.agentId)
          .eq("name", name)
          .eq("node_type", nodeType)
          .maybeSingle();

        let nodeId: string;

        if (existing?.id) {
          const { error } = await ctx.supabase
            .from("memory_nodes")
            .update({ content, properties })
            .eq("id", existing.id);
          if (error) return { result: `Error: ${error.message}` };
          nodeId = existing.id;
        } else {
          const { data: inserted, error } = await ctx.supabase
            .from("memory_nodes")
            .insert({
              agent_id: ctx.agentId,
              session_id: ctx.sessionId,
              name,
              node_type: nodeType,
              content,
              properties,
              strength: 1.0,
            })
            .select("id")
            .single();
          if (error) return { result: `Error: ${error.message}` };
          nodeId = inserted.id;
        }

        // If related_to, create edge
        if (relatedTo) {
          const { data: target } = await ctx.supabase
            .from("memory_nodes")
            .select("id")
            .eq("agent_id", ctx.agentId)
            .eq("name", relatedTo)
            .maybeSingle();

          if (target?.id) {
            await ctx.supabase.from("memory_edges").insert({
              source_node_id: nodeId,
              target_node_id: target.id,
              edge_type: "related_to",
              weight: 1.0,
              properties: {},
            });
          }
        }

        return { result: JSON.stringify({ remembered: name, id: nodeId }) };
      }

      // ---- recall ----
      case "recall": {
        const query = args.query as string;
        const nodeType = args.node_type as string | undefined;
        const flags = args.flags as string[] | undefined;
        const limit = (args.limit as number) || 10;

        if (!query) {
          return { result: "Error: 'query' is required for recall" };
        }

        let q = ctx.supabase
          .from("memory_nodes")
          .select("*")
          .eq("agent_id", ctx.agentId)
          .or(`name.ilike.%${query}%,content.ilike.%${query}%`)
          .order("strength", { ascending: false })
          .limit(limit);

        if (nodeType) q = q.eq("node_type", nodeType);
        if (flags && flags.length > 0) {
          for (const flag of flags) {
            q = q.contains("properties", { flags: [flag] });
          }
        }

        const { data, error } = await q;
        if (error) return { result: `Error: ${error.message}` };

        // Update access_count and last_accessed_at for returned nodes
        if (data && data.length > 0) {
          const ids = data.map((n: { id: string }) => n.id);
          await ctx.supabase.rpc("increment_access_count", { node_ids: ids }).catch(() => {
            // Fallback: update one-by-one if rpc doesn't exist
            return Promise.all(
              ids.map((id: string) =>
                ctx.supabase
                  .from("memory_nodes")
                  .update({
                    access_count: (data.find((n: { id: string }) => n.id === id)?.access_count ?? 0) + 1,
                    last_accessed_at: new Date().toISOString(),
                  })
                  .eq("id", id),
              ),
            );
          });
        }

        return { result: JSON.stringify(data ?? []) };
      }

      // ---- pin ----
      case "pin": {
        const nodeName = args.node_name as string;
        if (!nodeName) return { result: "Error: 'node_name' is required for pin" };

        const { data: node } = await ctx.supabase
          .from("memory_nodes")
          .select("id, properties")
          .eq("agent_id", ctx.agentId)
          .eq("name", nodeName)
          .maybeSingle();

        if (!node) return { result: `Error: Node "${nodeName}" not found` };

        const existingFlags: string[] = node.properties?.flags ?? [];
        const newFlags = existingFlags.includes("pinned")
          ? existingFlags
          : [...existingFlags, "pinned"];

        const { error } = await ctx.supabase
          .from("memory_nodes")
          .update({
            strength: 2.0,
            properties: { ...node.properties, flags: newFlags },
          })
          .eq("id", node.id);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ pinned: nodeName }) };
      }

      // ---- forget ----
      case "forget": {
        const nodeName = args.node_name as string;
        if (!nodeName) return { result: "Error: 'node_name' is required for forget" };

        const { data: node } = await ctx.supabase
          .from("memory_nodes")
          .select("id, properties")
          .eq("agent_id", ctx.agentId)
          .eq("name", nodeName)
          .maybeSingle();

        if (!node) return { result: `Error: Node "${nodeName}" not found` };

        if (node.properties?.source === "agent_explicit") {
          const { error } = await ctx.supabase
            .from("memory_nodes")
            .delete()
            .eq("id", node.id);
          if (error) return { result: `Error: ${error.message}` };
          return { result: JSON.stringify({ deleted: nodeName }) };
        }

        const { error } = await ctx.supabase
          .from("memory_nodes")
          .update({ strength: 0 })
          .eq("id", node.id);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ forgotten: nodeName }) };
      }

      // ---- list ----
      case "list": {
        const nodeType = args.node_type as string | undefined;
        const flags = args.flags as string[] | undefined;
        const limit = (args.limit as number) || 20;

        let q = ctx.supabase
          .from("memory_nodes")
          .select("id, name, node_type, content, strength, properties, last_accessed_at, created_at")
          .eq("agent_id", ctx.agentId)
          .order("strength", { ascending: false })
          .limit(limit);

        if (nodeType) q = q.eq("node_type", nodeType);
        if (flags && flags.length > 0) {
          for (const flag of flags) {
            q = q.contains("properties", { flags: [flag] });
          }
        }

        const { data, error } = await q;
        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      // ---- connect ----
      case "connect": {
        const sourceName = args.source_name as string;
        const targetName = args.target_name as string;
        const edgeType = args.edge_type as string;

        if (!sourceName || !targetName || !edgeType) {
          return {
            result: "Error: 'source_name', 'target_name', and 'edge_type' are required for connect",
          };
        }

        const [sourceRes, targetRes] = await Promise.all([
          ctx.supabase
            .from("memory_nodes")
            .select("id")
            .eq("agent_id", ctx.agentId)
            .eq("name", sourceName)
            .maybeSingle(),
          ctx.supabase
            .from("memory_nodes")
            .select("id")
            .eq("agent_id", ctx.agentId)
            .eq("name", targetName)
            .maybeSingle(),
        ]);

        if (!sourceRes.data) return { result: `Error: Source node "${sourceName}" not found` };
        if (!targetRes.data) return { result: `Error: Target node "${targetName}" not found` };

        const { error } = await ctx.supabase.from("memory_edges").insert({
          source_node_id: sourceRes.data.id,
          target_node_id: targetRes.data.id,
          edge_type: edgeType,
          weight: 1.0,
          properties: {},
        });

        if (error) return { result: `Error: ${error.message}` };
        return {
          result: JSON.stringify({ connected: { source: sourceName, target: targetName, edge_type: edgeType } }),
        };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_memory` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 3. manage_crons  (async approval)
// ---------------------------------------------------------------------------

async function handleManageCrons(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "create": {
        const cronName = args.cron_name as string;
        const cronSchedule = args.cron_schedule as string;
        const cronType = (args.cron_type as string) || "recurring";
        const edgeFunction = args.edge_function as string;
        const payload = (args.payload as Record<string, unknown>) || {};

        if (!cronName || !cronSchedule || !edgeFunction) {
          return {
            result: "Error: 'cron_name', 'cron_schedule', and 'edge_function' are required",
          };
        }

        // Validate minimum 5-minute interval (basic check)
        const parts = cronSchedule.split(" ");
        if (parts.length === 5 && parts[0] !== "*") {
          const minutePart = parts[0];
          if (minutePart.startsWith("*/")) {
            const interval = parseInt(minutePart.replace("*/", ""), 10);
            if (!isNaN(interval) && interval < 5) {
              return { result: "Error: Minimum cron interval is 5 minutes" };
            }
          }
        }

        // Max 5 crons per agent
        const { count } = await ctx.supabase
          .from("agent_crons")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", ctx.agentId);

        if ((count ?? 0) >= 5) {
          return { result: "Error: Maximum of 5 crons per agent reached" };
        }

        const { data: cron, error: cronErr } = await ctx.supabase
          .from("agent_crons")
          .insert({
            agent_id: ctx.agentId,
            cron_name: cronName,
            cron_schedule: cronSchedule,
            cron_type: cronType,
            edge_function: edgeFunction,
            payload,
            is_active: false,
          })
          .select("id")
          .single();

        if (cronErr) return { result: `Error: ${cronErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "create_cron",
            resource_table: "agent_crons",
            resource_id: cron.id,
            payload: { cron_name: cronName, cron_schedule: cronSchedule, edge_function: edgeFunction },
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ created: cron.id, status: "pending_approval" }),
          needsApproval: true,
          blocking: false,
        };
      }

      case "list": {
        const { data, error } = await ctx.supabase
          .from("agent_crons")
          .select("*")
          .eq("agent_id", ctx.agentId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "update": {
        const cronId = args.cron_id as string;
        if (!cronId) return { result: "Error: 'cron_id' is required for update" };

        const updates: Record<string, unknown> = {};
        if (args.cron_name !== undefined) updates.cron_name = args.cron_name;
        if (args.cron_schedule !== undefined) updates.cron_schedule = args.cron_schedule;
        if (args.cron_type !== undefined) updates.cron_type = args.cron_type;
        if (args.edge_function !== undefined) updates.edge_function = args.edge_function;
        if (args.payload !== undefined) updates.payload = args.payload;
        updates.is_active = false;

        const { error: upErr } = await ctx.supabase
          .from("agent_crons")
          .update(updates)
          .eq("id", cronId)
          .eq("agent_id", ctx.agentId);

        if (upErr) return { result: `Error: ${upErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "update_cron",
            resource_table: "agent_crons",
            resource_id: cronId,
            payload: updates,
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ updated: cronId, status: "pending_approval" }),
          needsApproval: true,
          blocking: false,
        };
      }

      case "delete": {
        const cronId = args.cron_id as string;
        if (!cronId) return { result: "Error: 'cron_id' is required for delete" };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "delete_cron",
            resource_table: "agent_crons",
            resource_id: cronId,
            payload: { cron_id: cronId },
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ delete_requested: cronId, status: "pending_approval" }),
          needsApproval: true,
          blocking: false,
        };
      }

      case "pause": {
        const cronId = args.cron_id as string;
        if (!cronId) return { result: "Error: 'cron_id' is required for pause" };

        const { error } = await ctx.supabase
          .from("agent_crons")
          .update({ is_active: false })
          .eq("id", cronId)
          .eq("agent_id", ctx.agentId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ paused: cronId }) };
      }

      case "resume": {
        const cronId = args.cron_id as string;
        if (!cronId) return { result: "Error: 'cron_id' is required for resume" };

        const { error } = await ctx.supabase
          .from("agent_crons")
          .update({ is_active: true })
          .eq("id", cronId)
          .eq("agent_id", ctx.agentId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ resumed: cronId }) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_crons` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 4. manage_agents  (blocking approval)
// ---------------------------------------------------------------------------

async function handleManageAgents(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "create": {
        const name = args.name as string;
        const slug = args.slug as string;
        const systemPrompt = args.system_prompt as string;
        const model = (args.model as string) || undefined;
        const providerId = (args.provider_id as string) || undefined;
        const description = (args.description as string) || undefined;
        const temperature = args.temperature as number | undefined;

        if (!name || !slug || !systemPrompt) {
          return { result: "Error: 'name', 'slug', and 'system_prompt' are required" };
        }

        const insertData: Record<string, unknown> = {
          name,
          slug,
          system_prompt: systemPrompt,
          role: "worker",
          is_active: false,
          is_default: false,
        };
        if (model) insertData.model = model;
        if (providerId) insertData.provider_id = providerId;
        if (description) insertData.description = description;
        if (temperature !== undefined) insertData.temperature = temperature;

        const { data: agent, error: agentErr } = await ctx.supabase
          .from("agents")
          .insert(insertData)
          .select("id")
          .single();

        if (agentErr) return { result: `Error: ${agentErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "create_agent",
            resource_table: "agents",
            resource_id: agent.id,
            payload: { name, slug },
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ created: agent.id, status: "pending_approval" }),
          needsApproval: true,
          blocking: true,
        };
      }

      case "list": {
        const { data, error } = await ctx.supabase
          .from("agents")
          .select("id, name, slug, role, is_default, is_active");

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "update": {
        const agentIdToUpdate = args.agent_id as string;
        if (!agentIdToUpdate) return { result: "Error: 'agent_id' is required for update" };

        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.slug !== undefined) updates.slug = args.slug;
        if (args.system_prompt !== undefined) updates.system_prompt = args.system_prompt;
        if (args.model !== undefined) updates.model = args.model;
        if (args.provider_id !== undefined) updates.provider_id = args.provider_id;
        if (args.description !== undefined) updates.description = args.description;
        if (args.temperature !== undefined) updates.temperature = args.temperature;
        if (args.is_active !== undefined) updates.is_active = args.is_active;

        if (Object.keys(updates).length === 0) {
          return { result: "Error: No fields provided to update" };
        }

        const { error: upErr } = await ctx.supabase
          .from("agents")
          .update(updates)
          .eq("id", agentIdToUpdate);

        if (upErr) return { result: `Error: ${upErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "update_agent",
            resource_table: "agents",
            resource_id: agentIdToUpdate,
            payload: updates,
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ updated: agentIdToUpdate, status: "pending_approval" }),
          needsApproval: true,
          blocking: true,
        };
      }

      case "get": {
        const agentIdOrSlug = (args.agent_id as string) || (args.slug as string);
        if (!agentIdOrSlug) return { result: "Error: 'agent_id' or 'slug' is required for get" };

        const { data, error } = await ctx.supabase
          .from("agents")
          .select("*")
          .or(`id.eq.${agentIdOrSlug},slug.eq.${agentIdOrSlug}`)
          .maybeSingle();

        if (error) return { result: `Error: ${error.message}` };
        if (!data) return { result: `Error: Agent "${agentIdOrSlug}" not found` };
        return { result: JSON.stringify(data) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_agents` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 5. manage_skills  (self-serve)
// ---------------------------------------------------------------------------

async function handleManageSkills(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "create": {
        const name = args.name as string;
        const description = (args.description as string) || "";
        const instructions = (args.instructions as string) || "";
        const metadata = (args.metadata as Record<string, unknown>) || {};
        const resources = (args.resources as unknown[]) || [];
        const skillId = (args.skill_id as string) || name.toLowerCase().replace(/\s+/g, "-");

        if (!name) return { result: "Error: 'name' is required for create" };

        const { data, error } = await ctx.supabase
          .from("skills")
          .insert({
            skill_id: skillId,
            name,
            description,
            instructions,
            metadata,
            resources,
            version: 1,
            is_active: true,
          })
          .select("id")
          .single();

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ created: data.id, skill_id: skillId }) };
      }

      case "list": {
        const { data, error } = await ctx.supabase
          .from("skills")
          .select("id, skill_id, name, description, version, is_active");

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "update": {
        const skillId = args.skill_id as string;
        if (!skillId) return { result: "Error: 'skill_id' is required for update" };

        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.description !== undefined) updates.description = args.description;
        if (args.instructions !== undefined) updates.instructions = args.instructions;
        if (args.metadata !== undefined) updates.metadata = args.metadata;
        if (args.resources !== undefined) updates.resources = args.resources;
        if (args.is_active !== undefined) updates.is_active = args.is_active;

        if (Object.keys(updates).length === 0) {
          return { result: "Error: No fields provided to update" };
        }

        const { error } = await ctx.supabase
          .from("skills")
          .update(updates)
          .eq("skill_id", skillId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ updated: skillId }) };
      }

      case "get": {
        const skillId = args.skill_id as string;
        if (!skillId) return { result: "Error: 'skill_id' is required for get" };

        const { data, error } = await ctx.supabase
          .from("skills")
          .select("*")
          .eq("skill_id", skillId)
          .maybeSingle();

        if (error) return { result: `Error: ${error.message}` };
        if (!data) return { result: `Error: Skill "${skillId}" not found` };
        return { result: JSON.stringify(data) };
      }

      case "assign": {
        const agentId = (args.agent_id as string) || ctx.agentId;
        const skillId = args.skill_id as string;
        if (!skillId) return { result: "Error: 'skill_id' is required for assign" };

        // Look up skill by skill_id to get its UUID
        const { data: skill } = await ctx.supabase
          .from("skills")
          .select("id")
          .eq("skill_id", skillId)
          .maybeSingle();

        if (!skill) return { result: `Error: Skill "${skillId}" not found` };

        const { error } = await ctx.supabase
          .from("agent_skills")
          .insert({ agent_id: agentId, skill_id: skill.id });

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ assigned: { agent_id: agentId, skill_id: skillId } }) };
      }

      case "unassign": {
        const agentId = (args.agent_id as string) || ctx.agentId;
        const skillId = args.skill_id as string;
        if (!skillId) return { result: "Error: 'skill_id' is required for unassign" };

        const { data: skill } = await ctx.supabase
          .from("skills")
          .select("id")
          .eq("skill_id", skillId)
          .maybeSingle();

        if (!skill) return { result: `Error: Skill "${skillId}" not found` };

        const { error } = await ctx.supabase
          .from("agent_skills")
          .delete()
          .eq("agent_id", agentId)
          .eq("skill_id", skill.id);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ unassigned: { agent_id: agentId, skill_id: skillId } }) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_skills` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 6. manage_tools  (blocking approval for create/update)
// ---------------------------------------------------------------------------

async function handleManageTools(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "create": {
        const name = args.name as string;
        const slug = (args.slug as string) || name?.toLowerCase().replace(/\s+/g, "-");
        const type = args.type as string;
        const config = (args.config as Record<string, unknown>) || {};
        const description = (args.description as string) || "";
        // Agent-created tools must have requires_approval=true (enforced by DB constraint)
        const requiresApproval = true;

        if (!name || !type) {
          return { result: "Error: 'name' and 'type' are required for create" };
        }
        // Spawn tools require target_agent_id in config
        if (type === "spawn" && !config.target_agent_id) {
          return { result: "Error: spawn tools require 'config.target_agent_id'" };
        }

        const { data: tool, error: toolErr } = await ctx.supabase
          .from("tools")
          .insert({
            name,
            slug,
            type,
            config,
            description,
            is_active: false,
            created_by: ctx.agentId,
            requires_approval: requiresApproval,
          })
          .select("id")
          .single();

        if (toolErr) return { result: `Error: ${toolErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "create_tool",
            resource_table: "tools",
            resource_id: tool.id,
            payload: { name, slug, type },
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ created: tool.id, status: "pending_approval" }),
          needsApproval: true,
          blocking: true,
        };
      }

      case "list": {
        const { data, error } = await ctx.supabase
          .from("tools")
          .select("id, name, slug, type, description, is_active, requires_approval");

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "get": {
        const toolId = (args.tool_id as string) || (args.slug as string);
        if (!toolId) return { result: "Error: 'tool_id' or 'slug' is required for get" };

        const { data, error } = await ctx.supabase
          .from("tools")
          .select("*")
          .or(`id.eq.${toolId},slug.eq.${toolId}`)
          .maybeSingle();

        if (error) return { result: `Error: ${error.message}` };
        if (!data) return { result: `Error: Tool "${toolId}" not found` };
        return { result: JSON.stringify(data) };
      }

      case "update": {
        const toolId = args.tool_id as string;
        if (!toolId) return { result: "Error: 'tool_id' is required for update" };

        const updates: Record<string, unknown> = {};
        if (args.name !== undefined) updates.name = args.name;
        if (args.slug !== undefined) updates.slug = args.slug;
        if (args.type !== undefined) updates.type = args.type;
        if (args.config !== undefined) updates.config = args.config;
        if (args.description !== undefined) updates.description = args.description;
        if (args.requires_approval !== undefined) updates.requires_approval = args.requires_approval;
        updates.is_active = false;

        if (Object.keys(updates).length <= 1) {
          return { result: "Error: No fields provided to update" };
        }

        const { error: upErr } = await ctx.supabase
          .from("tools")
          .update(updates)
          .eq("id", toolId);

        if (upErr) return { result: `Error: ${upErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "update_tool",
            resource_table: "tools",
            resource_id: toolId,
            payload: updates,
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ updated: toolId, status: "pending_approval" }),
          needsApproval: true,
          blocking: true,
        };
      }

      case "assign": {
        const agentId = (args.agent_id as string) || ctx.agentId;
        const toolId = args.tool_id as string;
        if (!toolId) return { result: "Error: 'tool_id' is required for assign" };

        const { error } = await ctx.supabase
          .from("agent_tools")
          .insert({ agent_id: agentId, tool_id: toolId });

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ assigned: { agent_id: agentId, tool_id: toolId } }) };
      }

      case "unassign": {
        const agentId = (args.agent_id as string) || ctx.agentId;
        const toolId = args.tool_id as string;
        if (!toolId) return { result: "Error: 'tool_id' is required for unassign" };

        const { error } = await ctx.supabase
          .from("agent_tools")
          .delete()
          .eq("agent_id", agentId)
          .eq("tool_id", toolId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ unassigned: { agent_id: agentId, tool_id: toolId } }) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_tools` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 7. manage_code_files  (async approval for deploy)
// ---------------------------------------------------------------------------

async function handleManageCodeFiles(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "write": {
        const filePath = args.file_path as string;
        const fileType = (args.file_type as string) || "ts";
        const content = args.content as string;

        if (!filePath || !content) {
          return { result: "Error: 'file_path' and 'content' are required for write" };
        }

        // Check for existing file record
        const { data: existing } = await ctx.supabase
          .from("agent_code_files")
          .select("id, version")
          .eq("agent_id", ctx.agentId)
          .eq("file_path", filePath)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await ctx.supabase
            .from("agent_code_files")
            .update({
              file_type: fileType,
              version: (existing.version ?? 0) + 1,
              storage_path: `inline:${ctx.agentId}/${filePath}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) return { result: `Error: ${error.message}` };
          return { result: JSON.stringify({ updated: existing.id, file_path: filePath, version: (existing.version ?? 0) + 1 }) };
        }

        const { data: inserted, error } = await ctx.supabase
          .from("agent_code_files")
          .insert({
            agent_id: ctx.agentId,
            session_id: ctx.sessionId,
            file_path: filePath,
            file_type: fileType,
            storage_path: `inline:${ctx.agentId}/${filePath}`,
            version: 1,
          })
          .select("id")
          .single();

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ created: inserted.id, file_path: filePath, version: 1 }) };
      }

      case "read": {
        const fileId = (args.file_id as string) || undefined;
        const filePath = (args.file_path as string) || undefined;

        if (!fileId && !filePath) {
          return { result: "Error: 'file_id' or 'file_path' is required for read" };
        }

        let q = ctx.supabase.from("agent_code_files").select("*");
        if (fileId) {
          q = q.eq("id", fileId);
        } else {
          q = q.eq("agent_id", ctx.agentId).eq("file_path", filePath!);
        }

        const { data, error } = await q.maybeSingle();
        if (error) return { result: `Error: ${error.message}` };
        if (!data) return { result: "Error: File not found" };
        return { result: JSON.stringify(data) };
      }

      case "list": {
        const { data, error } = await ctx.supabase
          .from("agent_code_files")
          .select("id, file_path, file_type, version, created_at, updated_at")
          .eq("agent_id", ctx.agentId)
          .order("updated_at", { ascending: false });

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "deploy": {
        const functionName = args.function_name as string;
        const functionSlug = (args.function_slug as string) || functionName?.toLowerCase().replace(/\s+/g, "-");
        const sourceCodeFileId = args.source_code_file_id as string;
        const config = (args.config as Record<string, unknown>) || {};

        if (!functionName || !sourceCodeFileId) {
          return {
            result: "Error: 'function_name' and 'source_code_file_id' are required for deploy",
          };
        }

        const { data: fn, error: fnErr } = await ctx.supabase
          .from("deployed_functions")
          .insert({
            agent_id: ctx.agentId,
            function_name: functionName,
            function_slug: functionSlug,
            source_code_file_id: sourceCodeFileId,
            status: "pending_approval",
            config,
          })
          .select("id")
          .single();

        if (fnErr) return { result: `Error: ${fnErr.message}` };

        const { error: apprErr } = await ctx.supabase
          .from("approval_requests")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            session_id: ctx.sessionId,
            action_type: "deploy_function",
            resource_table: "deployed_functions",
            resource_id: fn.id,
            payload: { function_name: functionName, function_slug: functionSlug, source_code_file_id: sourceCodeFileId },
            status: "pending",
          });

        if (apprErr) return { result: `Error: ${apprErr.message}` };
        return {
          result: JSON.stringify({ deployed: fn.id, status: "pending_approval" }),
          needsApproval: true,
          blocking: false,
        };
      }

      default:
        return { result: `Error: Unknown action "${action}" for manage_code_files` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 8. log_activity  (self-serve)
// ---------------------------------------------------------------------------

async function handleLogActivity(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "log": {
        const activityType = args.activity_type as string;
        const description = args.description as string;
        const metadata = (args.metadata as Record<string, unknown>) || {};

        if (!activityType || !description) {
          return { result: "Error: 'activity_type' and 'description' are required for log" };
        }

        const { data, error } = await ctx.supabase
          .from("activities")
          .insert({
            agent_id: ctx.agentId,
            task_id: ctx.taskId,
            activity_type: activityType,
            description,
            metadata,
          })
          .select("id")
          .single();

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ logged: data.id }) };
      }

      case "list": {
        const agentId = (args.agent_id as string) || ctx.agentId;
        const limit = (args.limit as number) || 20;

        const { data, error } = await ctx.supabase
          .from("activities")
          .select("*")
          .eq("agent_id", agentId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for log_activity` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// 9. notify_agent  (self-serve)
// ---------------------------------------------------------------------------

async function handleNotifyAgent(
  args: Record<string, unknown>,
  ctx: SelfManagementContext,
): Promise<SelfManagementResult> {
  try {
    const action = args.action as string;

    switch (action) {
      case "send": {
        const targetAgentId = args.agent_id as string;
        const type = (args.type as string) || "info";
        const title = args.title as string;
        const body = (args.body as string) || "";
        const metadata = (args.metadata as Record<string, unknown>) || {};

        if (!targetAgentId || !title) {
          return { result: "Error: 'agent_id' and 'title' are required for send" };
        }

        const { data, error } = await ctx.supabase
          .from("notifications")
          .insert({
            agent_id: targetAgentId,
            type,
            title,
            body,
            read: false,
            metadata: { ...metadata, sent_by: ctx.agentId },
          })
          .select("id")
          .single();

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ sent: data.id, to: targetAgentId }) };
      }

      case "list_mine": {
        const { data, error } = await ctx.supabase
          .from("notifications")
          .select("*")
          .eq("agent_id", ctx.agentId)
          .eq("read", false)
          .order("created_at", { ascending: false });

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify(data ?? []) };
      }

      case "mark_read": {
        const ids = args.ids as string[];
        if (!ids || ids.length === 0) {
          return { result: "Error: 'ids' array is required for mark_read" };
        }

        const { error } = await ctx.supabase
          .from("notifications")
          .update({ read: true })
          .in("id", ids)
          .eq("agent_id", ctx.agentId);

        if (error) return { result: `Error: ${error.message}` };
        return { result: JSON.stringify({ marked_read: ids.length }) };
      }

      default:
        return { result: `Error: Unknown action "${action}" for notify_agent` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: `Error: ${message}` };
  }
}
