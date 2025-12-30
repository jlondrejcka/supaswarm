import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { Skill, LLMToolDefinition } from "./types.ts";

/**
 * Format skill list for system prompt
 * Shows name, version, and description for each skill
 */
export function getSkillListForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const header = "Call load_skill(skill_id) to get full instructions when needed.\n";
  const skillList = skills
    .map((s) => `- **${s.skill_id}** (v${s.version || "1.0.0"}): ${s.description}`)
    .join("\n");

  return header + "\n" + skillList;
}

/**
 * Load full skill from database by skill_id
 */
export async function loadSkill(
  supabase: SupabaseClient,
  skillId: string,
): Promise<Skill | null> {
  console.log("[SKILL] Loading skill", { skill_id: skillId });

  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .eq("skill_id", skillId)
    .eq("is_active", true)
    .single();

  if (error) {
    console.error("[SKILL] Failed to load skill", {
      skill_id: skillId,
      error: error.message,
    });
    return null;
  }

  console.log("[SKILL] Skill loaded", {
    skill_id: skillId,
    name: data.name,
    instructions_length: data.instructions?.length || 0,
  });

  return data as Skill;
}

/**
 * Get the load_skill pseudo-tool definition
 */
export function getLoadSkillToolDefinition(): LLMToolDefinition {
  return {
    type: "function",
    function: {
      name: "load_skill",
      description:
        "Load detailed instructions for a skill. Use when you need the full guidance for a specific capability.",
      parameters: {
        type: "object",
        properties: {
          skill_id: {
            type: "string",
            description: "The skill_id to load",
          },
        },
        required: ["skill_id"],
      },
    },
  };
}

/**
 * Fetch skills assigned to an agent
 */
export async function fetchAgentSkills(
  supabase: SupabaseClient,
  agentId: string,
): Promise<Skill[]> {
  // Get skill IDs assigned to agent
  const { data: agentSkillsData, error: agentSkillsError } = await supabase
    .from("agent_skills")
    .select("skill_id")
    .eq("agent_id", agentId);

  if (agentSkillsError) {
    console.error("[SKILL] Failed to fetch agent skills", {
      agent_id: agentId,
      error: agentSkillsError.message,
    });
    return [];
  }

  const skillIds = agentSkillsData?.map((as) => as.skill_id) || [];

  if (skillIds.length === 0) {
    return [];
  }

  // Fetch full skill records
  const { data: skillsData, error: skillsError } = await supabase
    .from("skills")
    .select("*")
    .in("id", skillIds)
    .eq("is_active", true);

  if (skillsError) {
    console.error("[SKILL] Failed to fetch skills", {
      skill_ids: skillIds,
      error: skillsError.message,
    });
    return [];
  }

  return (skillsData || []) as Skill[];
}







