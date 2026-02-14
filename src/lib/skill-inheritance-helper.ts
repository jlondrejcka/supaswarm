import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch tool IDs linked to a skill via skill_tools
 */
export async function getSkillLinkedToolIds(
  supabase: SupabaseClient,
  skillId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("skill_tools")
    .select("tool_id")
    .eq("skill_id", skillId);

  if (error) {
    console.error("getSkillLinkedToolIds error:", error);
    return [];
  }

  return (data || []).map((r) => r.tool_id);
}

/**
 * Add tools linked to a skill to an agent, with inherited_from_skill_id.
 * Replaces existing agent_tools for those tools (updates inherited_from_skill_id).
 */
export async function inheritToolsForSkill(
  supabase: SupabaseClient,
  agentId: string,
  skillId: string
): Promise<{ inherited: number; errors: string[] }> {
  const toolIds = await getSkillLinkedToolIds(supabase, skillId);
  const errors: string[] = [];

  for (const toolId of toolIds) {
    const { error } = await supabase
      .from("agent_tools")
      .upsert(
        { agent_id: agentId, tool_id: toolId, inherited_from_skill_id: skillId },
        { onConflict: "agent_id,tool_id" }
      );

    if (error) {
      errors.push(`Tool ${toolId}: ${error.message}`);
    }
  }

  return { inherited: toolIds.length, errors };
}

/**
 * Remove tools from agent that were only inherited from this skill.
 * Keeps tools that are manually added or inherited from other skills still assigned.
 */
export async function removeInheritedToolsForSkill(
  supabase: SupabaseClient,
  agentId: string,
  skillId: string
): Promise<void> {
  await supabase
    .from("agent_tools")
    .delete()
    .eq("agent_id", agentId)
    .eq("inherited_from_skill_id", skillId);
}

/**
 * Compute agent_tools rows for bulk save: merge selectedTools with tools from selectedSkills.
 * Tools from skills get inherited_from_skill_id; manual tools get null.
 * If tool in both, skill wins (replace).
 */
export async function computeAgentToolsRows(
  supabase: SupabaseClient,
  selectedSkillIds: string[],
  selectedToolIds: string[]
): Promise<{ tool_id: string; inherited_from_skill_id: string | null }[]> {
  const toolToSkill = new Map<string, string | null>();
  for (const toolId of selectedToolIds) {
    toolToSkill.set(toolId, null);
  }

  for (const skillId of selectedSkillIds) {
    const linkedIds = await getSkillLinkedToolIds(supabase, skillId);
    for (const toolId of linkedIds) {
      toolToSkill.set(toolId, skillId);
    }
  }

  return Array.from(toolToSkill.entries()).map(([tool_id, skillId]) => ({
    tool_id,
    inherited_from_skill_id: skillId,
  }));
}

/**
 * Sync agent skills and tools with inheritance.
 * Caller must pass agentId. Deletes existing agent_skills and agent_tools, then inserts.
 */
export async function syncAgentSkillsAndTools(
  supabase: SupabaseClient,
  agentId: string,
  selectedSkillIds: string[],
  selectedToolIds: string[]
): Promise<{ error?: string }> {
  try {
    await supabase.from("agent_skills").delete().eq("agent_id", agentId);
    await supabase.from("agent_tools").delete().eq("agent_id", agentId);

    if (selectedSkillIds.length > 0) {
      const { error } = await supabase.from("agent_skills").insert(
        selectedSkillIds.map((skill_id) => ({ agent_id: agentId, skill_id, priority: 5 }))
      );
      if (error) return { error: error.message };
    }

    const rows = await computeAgentToolsRows(supabase, selectedSkillIds, selectedToolIds);
    const toInsert = rows.map((r) => ({
      agent_id: agentId,
      tool_id: r.tool_id,
      inherited_from_skill_id: r.inherited_from_skill_id,
    }));

    if (toInsert.length > 0) {
      const { error } = await supabase.from("agent_tools").insert(toInsert);
      if (error) return { error: error.message };
    }

    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("syncAgentSkillsAndTools error:", msg);
    return { error: msg };
  }
}
