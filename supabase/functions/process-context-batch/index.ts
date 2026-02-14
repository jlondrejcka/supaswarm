import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generateIncrementalSummary, buildTranscriptEntry } from "./summarizer.ts";
import { generateEmbedding } from "./embedding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContextJob {
  msg_id: number;
  message: {
    type: string;
    master_task_id: string;
    completed_task_id: string;
    agent_slug: string;
    is_strategic: boolean;
    queued_at: string;
  };
}

interface TaskMessage {
  role: string;
  type: string;
  content: unknown;
}

interface ContextStory {
  id: string;
  master_task_id: string;
  headline: string | null;
  summary: string | null;
  full_transcript: string | null;
  objective: string | null;
  current_state: string | null;
  key_facts: string[];
  agents_involved: string[];
  turn_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[CONTEXT-BATCH] Starting context graph processing", { timestamp: new Date().toISOString() });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read jobs from queue (up to 10 at a time)
    const { data: jobs, error: queueError } = await supabase.rpc("pgmq_read", {
      p_queue_name: "context_graph_jobs",
      p_visibility_timeout: 300, // 5 minute visibility timeout
      p_quantity: 10,
    });

    if (queueError) {
      console.error("[CONTEXT-BATCH] Failed to read queue", { error: queueError.message });
      return new Response(
        JSON.stringify({ error: "Failed to read queue", details: queueError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log("[CONTEXT-BATCH] No jobs in queue");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No jobs in queue" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[CONTEXT-BATCH] Found jobs to process", { count: jobs.length });

    let processed = 0;
    let failed = 0;

    for (const job of jobs as ContextJob[]) {
      try {
        const { master_task_id, completed_task_id, agent_slug, is_strategic } = job.message;
        
        console.log("[CONTEXT-BATCH] Processing job", {
          msg_id: job.msg_id,
          master_task_id: master_task_id.slice(0, 8),
          agent_slug,
        });

        // Fetch the completed task and its messages
        const { data: completedTask, error: taskError } = await supabase
          .from("tasks")
          .select("id, input, output, agent_slug, graph_node_id")
          .eq("id", completed_task_id)
          .single();

        if (taskError || !completedTask) {
          console.error("[CONTEXT-BATCH] Failed to fetch task", { error: taskError?.message });
          failed++;
          continue;
        }

        // Fetch task messages for the completed task
        const { data: messages } = await supabase
          .from("task_messages")
          .select("role, type, content")
          .eq("task_id", completed_task_id)
          .in("type", ["user_message", "assistant_message"])
          .order("created_at", { ascending: true });

        // Build transcript entry for this turn
        const userMessage = (completedTask.input as { message?: string })?.message || "";
        const assistantResponse = (completedTask.output as { response?: string })?.response || "";
        const transcriptEntry = buildTranscriptEntry(userMessage, assistantResponse, agent_slug);

        // Fetch existing context story (if any)
        const { data: existingStory } = await supabase
          .from("context_stories")
          .select("*")
          .eq("master_task_id", master_task_id)
          .single();

        // Get all agents involved in this conversation
        const { data: allTasks } = await supabase
          .from("tasks")
          .select("agent_slug")
          .or(`id.eq.${master_task_id},master_task_id.eq.${master_task_id}`);

        const agentsInvolved = [...new Set(
          (allTasks || [])
            .map(t => t.agent_slug)
            .filter(Boolean) as string[]
        )];

        // Generate incremental summary via Grok
        const summaryResult = await generateIncrementalSummary(
          supabase,
          existingStory?.summary || "",
          userMessage,
          assistantResponse,
          agent_slug,
        );

        // Build updated transcript
        const updatedTranscript = existingStory?.full_transcript
          ? `${existingStory.full_transcript}\n\n${transcriptEntry}`
          : transcriptEntry;

        // Merge key facts
        const existingFacts = (existingStory?.key_facts as string[]) || [];
        const newFacts = summaryResult.new_key_facts || [];
        const mergedFacts = [...new Set([...existingFacts, ...newFacts])];

        // Generate embedding from summary
        const embedding = await generateEmbedding(summaryResult.summary);

        // Upsert context story
        const contextStoryData = {
          master_task_id,
          root_node_id: completedTask.graph_node_id,
          is_strategic,
          headline: summaryResult.headline,
          summary: summaryResult.summary,
          full_transcript: updatedTranscript,
          objective: summaryResult.objective,
          current_state: summaryResult.current_state,
          key_facts: mergedFacts,
          agents_involved: agentsInvolved,
          turn_count: (existingStory?.turn_count || 0) + 1,
          embedding,
          last_turn_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase
          .from("context_stories")
          .upsert(contextStoryData, { onConflict: "master_task_id" });

        if (upsertError) {
          console.error("[CONTEXT-BATCH] Failed to upsert context story", { error: upsertError.message });
          failed++;
          continue;
        }

        // Delete job from queue
        await supabase.rpc("pgmq_delete", {
          p_queue_name: "context_graph_jobs",
          p_msg_id: job.msg_id,
        });

        console.log("[CONTEXT-BATCH] Job processed successfully", {
          master_task_id: master_task_id.slice(0, 8),
          turn_count: contextStoryData.turn_count,
          headline: summaryResult.headline?.slice(0, 50),
        });

        processed++;
      } catch (jobError) {
        console.error("[CONTEXT-BATCH] Error processing job", {
          msg_id: job.msg_id,
          error: jobError instanceof Error ? jobError.message : String(jobError),
        });
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    console.log("[CONTEXT-BATCH] Batch complete", { processed, failed, duration_ms: duration });

    return new Response(
      JSON.stringify({ success: true, processed, failed, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CONTEXT-BATCH] Fatal error", { error: message });
    
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
