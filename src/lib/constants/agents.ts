/**
 * Configuration des agents AI supportés
 */

export interface Agent {
  id: string;
  name: string;
  icon: string | null;
  cliArg: string;
}

export const AGENTS: Agent[] = [
  { id: "claude", name: "Claude Code", icon: "/claude-ai-icon.svg", cliArg: "claude" },
  { id: "cursor", name: "Cursor", icon: "/cursor_light.svg", cliArg: "cursor-agent" },
  { id: "windsurf", name: "Windsurf", icon: "/windsurf-light.svg", cliArg: "windsurf" },
  { id: "copilot", name: "GitHub Copilot", icon: "/copilot.svg", cliArg: "copilot" },
  { id: "other", name: "Other", icon: null, cliArg: "other" },
] as const;

export type AgentId = typeof AGENTS[number]["id"];

export function getAgentById(id: string): Agent | undefined {
  return AGENTS.find((agent) => agent.id === id);
}

export function getAgentByCliArg(cliArg: string): Agent | undefined {
  return AGENTS.find((agent) => agent.cliArg === cliArg);
}
