// Grok summarization for context graphs
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export interface SummaryResult {
  headline: string;
  summary: string;
  objective: string;
  current_state: string;
  new_key_facts: string[];
}

const INCREMENTAL_SUMMARY_PROMPT = `You are updating a conversation summary for an AI agent orchestration system.

EXISTING SUMMARY:
{existing_summary}

NEW TURN:
User: {user_message}
Agent ({agent_slug}): {agent_response}

Instructions:
1. Update HEADLINE (1 sentence) reflecting the current state of the conversation
2. Generate ROLLING_SUMMARY (max 500 words):
   - Compress older turns into key points
   - Keep recent 2-3 turns more detailed
   - Maintain coherence and narrative flow
3. Update OBJECTIVE to reflect what the user is trying to accomplish
4. Extract new KEY_FACTS worth remembering (important decisions, data, outcomes)
5. Set CURRENT_STATE to describe where the conversation is now

Output valid JSON only, no markdown:
{
  "headline": "...",
  "summary": "...",
  "objective": "...",
  "current_state": "...",
  "new_key_facts": ["...", "..."]
}`;

const INITIAL_SUMMARY_PROMPT = `You are creating an initial summary for a conversation in an AI agent orchestration system.

CONVERSATION:
User: {user_message}
Agent ({agent_slug}): {agent_response}

Instructions:
1. Create HEADLINE (1 sentence) describing the conversation topic
2. Generate SUMMARY describing what was discussed/accomplished
3. Identify the user's OBJECTIVE
4. Extract KEY_FACTS worth remembering
5. Set CURRENT_STATE to describe the conversation status

Output valid JSON only, no markdown:
{
  "headline": "...",
  "summary": "...",
  "objective": "...",
  "current_state": "...",
  "new_key_facts": ["...", "..."]
}`;

/**
 * Build a transcript entry for a turn
 */
export function buildTranscriptEntry(
  userMessage: string,
  assistantResponse: string,
  agentSlug: string,
): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] Turn with ${agentSlug}
User: ${userMessage}
Agent: ${assistantResponse}`;
}

/**
 * Generate an incremental summary using Grok
 */
export async function generateIncrementalSummary(
  supabase: SupabaseClient,
  existingSummary: string,
  userMessage: string,
  assistantResponse: string,
  agentSlug: string,
): Promise<SummaryResult> {
  // Get xAI API key from vault
  const { data: apiKey, error: vaultError } = await supabase.rpc("get_vault_secret", {
    secret_name: "xai_api_key",
  });

  if (vaultError || !apiKey) {
    console.error("[SUMMARIZER] Failed to get xAI API key", { error: vaultError?.message });
    // Return a basic summary if we can't get the API key
    return {
      headline: `Conversation with ${agentSlug}`,
      summary: `User asked: "${userMessage.slice(0, 100)}..." Agent responded with assistance.`,
      objective: "User inquiry",
      current_state: "Awaiting response or follow-up",
      new_key_facts: [],
    };
  }

  // Choose prompt based on whether we have existing summary
  const prompt = existingSummary
    ? INCREMENTAL_SUMMARY_PROMPT
        .replace("{existing_summary}", existingSummary)
        .replace("{user_message}", userMessage)
        .replace("{agent_response}", assistantResponse)
        .replace("{agent_slug}", agentSlug)
    : INITIAL_SUMMARY_PROMPT
        .replace("{user_message}", userMessage)
        .replace("{agent_response}", assistantResponse)
        .replace("{agent_slug}", agentSlug);

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4-1-mini",
        messages: [
          {
            role: "system",
            content: "You are a precise summarization assistant. Output only valid JSON, no markdown formatting.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SUMMARIZER] Grok API error", { status: response.status, error: errorText });
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in Grok response");
    }

    // Parse JSON response
    const parsed = JSON.parse(content);
    
    return {
      headline: parsed.headline || `Conversation with ${agentSlug}`,
      summary: parsed.summary || existingSummary || userMessage.slice(0, 200),
      objective: parsed.objective || "User inquiry",
      current_state: parsed.current_state || "In progress",
      new_key_facts: Array.isArray(parsed.new_key_facts) ? parsed.new_key_facts : [],
    };
  } catch (error) {
    console.error("[SUMMARIZER] Error generating summary", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return fallback summary
    return {
      headline: `Conversation with ${agentSlug}`,
      summary: existingSummary || `User: "${userMessage.slice(0, 100)}..." Agent provided assistance.`,
      objective: "User inquiry",
      current_state: "Awaiting follow-up",
      new_key_facts: [],
    };
  }
}
