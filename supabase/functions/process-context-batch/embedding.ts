// gte-small embedding generation for context graphs
// Uses Supabase's built-in AI model - no external API needed!

// Type declaration for Supabase AI Session
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (input: string, options?: { mean_pool?: boolean; normalize?: boolean }) => Promise<{ data: Float32Array }>;
    };
  };
};

// Initialize the gte-small model session
let modelSession: ReturnType<typeof Supabase.ai.Session> | null = null;

function getModelSession() {
  if (!modelSession) {
    modelSession = new Supabase.ai.Session("gte-small");
  }
  return modelSession;
}

/**
 * Generate a 384-dimension embedding using gte-small
 * This runs directly in the Edge Function - no external API calls!
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    console.log("[EMBEDDING] Empty text, skipping embedding generation");
    return null;
  }

  try {
    const model = getModelSession();
    
    const output = await model.run(text, {
      mean_pool: true,
      normalize: true,
    });

    // Convert Float32Array to regular number array
    const embedding = Array.from(output.data);
    
    console.log("[EMBEDDING] Generated embedding", {
      text_length: text.length,
      embedding_dims: embedding.length,
    });

    return embedding;
  } catch (error) {
    console.error("[EMBEDDING] Failed to generate embedding", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    results.push(embedding);
  }
  
  return results;
}
