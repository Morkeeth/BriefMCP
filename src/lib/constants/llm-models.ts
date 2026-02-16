/**
 * Configuration des modèles LLM disponibles
 */

export type LLMProvider =
  | "qwen-72b"
  | "deepseek-v3"
  | "qwen-coder"
  | "mistral-small"
  | "mistral-nemo"
  | "llama-70b"
  | "glm"
  | "openai";

export type ModelCategory = "fast" | "balanced" | "smart" | "code" | "reasoning";

export interface LLMModel {
  id: LLMProvider;
  displayName: string;
  description: string;
  category: ModelCategory;
  badge?: string;
}

export const LLM_MODELS: LLMModel[] = [
  {
    id: "mistral-nemo",
    displayName: "Mistral Nemo 12B",
    description: "Ultra rapide, idéal pour des réponses simples",
    category: "fast",
  },
  {
    id: "mistral-small",
    displayName: "Mistral Small 24B",
    description: "Rapide et efficace, bon équilibre",
    category: "fast",
    badge: "Recommandé",
  },
  {
    id: "llama-70b",
    displayName: "Llama 3.3 70B",
    description: "Modèle Meta équilibré et polyvalent",
    category: "balanced",
  },
  {
    id: "qwen-72b",
    displayName: "Qwen 2.5 72B",
    description: "Très intelligent, excellent pour les tâches complexes",
    category: "smart",
  },
  {
    id: "deepseek-v3",
    displayName: "DeepSeek V3",
    description: "Spécialisé dans le raisonnement et l'analyse",
    category: "reasoning",
  },
  {
    id: "qwen-coder",
    displayName: "Qwen 2.5 Coder 32B",
    description: "Optimisé pour le code et les tâches techniques",
    category: "code",
  },
  {
    id: "glm",
    displayName: "GLM 4.7",
    description: "Bon pour le raisonnement et le code",
    category: "balanced",
  },
  {
    id: "openai",
    displayName: "GPT-4o Mini",
    description: "Modèle OpenAI fiable en fallback",
    category: "balanced",
  },
] as const;

export const DEFAULT_LLM_MODEL: LLMProvider = "mistral-small";

export function getModelById(id: string): LLMModel | undefined {
  return LLM_MODELS.find((model) => model.id === id);
}

export function getModelsByCategory(category: ModelCategory): LLMModel[] {
  return LLM_MODELS.filter((model) => model.category === category);
}

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  fast: "Rapide",
  balanced: "Équilibré",
  smart: "Intelligent",
  code: "Code",
  reasoning: "Raisonnement",
};
