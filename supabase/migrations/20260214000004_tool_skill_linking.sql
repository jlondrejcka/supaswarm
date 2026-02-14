-- Tool-Skill linking (many-to-many) and agent tool inheritance tracking

-- skill_tools: which tools a skill uses
CREATE TABLE IF NOT EXISTS public.skill_tools (
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_tools_skill ON public.skill_tools(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_tools_tool ON public.skill_tools(tool_id);

-- agent_tools: track which skill inherited this tool (nullable = manually added)
ALTER TABLE public.agent_tools
  ADD COLUMN IF NOT EXISTS inherited_from_skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tools_inherited ON public.agent_tools(inherited_from_skill_id)
  WHERE inherited_from_skill_id IS NOT NULL;

-- RLS for skill_tools
ALTER TABLE public.skill_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_skill_tools" ON public.skill_tools FOR SELECT USING (true);
CREATE POLICY "manage_skill_tools" ON public.skill_tools FOR ALL USING (true) WITH CHECK (true);

-- agent_tools: add UPDATE for inherited_from_skill_id
CREATE POLICY "update_agent_tools" ON public.agent_tools FOR UPDATE USING (true) WITH CHECK (true);
