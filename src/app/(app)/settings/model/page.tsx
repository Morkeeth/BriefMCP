"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Check, Zap, Brain, Code, Sparkles, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

type LLMProvider = 'qwen-72b' | 'deepseek-v3' | 'qwen-coder' | 'mistral-small' | 'mistral-nemo' | 'llama-70b' | 'glm' | 'openai';
type Category = 'fast' | 'balanced' | 'smart' | 'code' | 'reasoning';

interface ModelOption {
  id: LLMProvider;
  name: string;
  description: string;
  category: Category;
  badge?: string;
}

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  fast: { label: 'Fast', icon: <Zap className="w-3.5 h-3.5" />, color: 'text-yellow-500' },
  balanced: { label: 'Balanced', icon: <Scale className="w-3.5 h-3.5" />, color: 'text-blue-500' },
  smart: { label: 'Smart', icon: <Brain className="w-3.5 h-3.5" />, color: 'text-purple-500' },
  code: { label: 'Code', icon: <Code className="w-3.5 h-3.5" />, color: 'text-green-500' },
  reasoning: { label: 'Reasoning', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-orange-500' },
};

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'mistral-small', name: 'Mistral Small 24B', description: 'Fast and efficient. Recommended for most use cases.', category: 'fast', badge: 'Recommended' },
  { id: 'mistral-nemo', name: 'Mistral Nemo 12B', description: 'Ultra fast. Ideal for simple responses.', category: 'fast' },
  { id: 'llama-70b', name: 'Llama 3.3 70B', description: 'Balanced and versatile Meta model.', category: 'balanced' },
  { id: 'qwen-72b', name: 'Qwen 2.5 72B', description: 'Very intelligent. Excellent for complex tasks.', category: 'smart' },
  { id: 'deepseek-v3', name: 'DeepSeek V3', description: 'Specialized in reasoning and deep analysis.', category: 'reasoning' },
  { id: 'qwen-coder', name: 'Qwen 2.5 Coder 32B', description: 'Optimized for code and technical tasks.', category: 'code' },
  { id: 'glm', name: 'GLM 4.7', description: 'Good for reasoning and code.', category: 'balanced' },
  { id: 'openai', name: 'GPT-4o Mini', description: 'Reliable OpenAI model. Used as fallback.', category: 'balanced' },
];

export default function ModelSettingsPage() {
  const [selectedModel, setSelectedModel] = useState<LLMProvider>('mistral-small');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Load membership from organization_members (per-org preferences)
      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id, llm_model")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();

      if (!membership?.org_id) {
        router.push('/organizations');
        return;
      }

      setOrgId(membership.org_id);

      // Load user's preferred model for this organization
      if (membership?.llm_model) {
        const currentModel = membership.llm_model as LLMProvider;
        if (MODEL_OPTIONS.some(m => m.id === currentModel)) {
          setSelectedModel(currentModel);
        }
      }

      setLoading(false);
    };

    loadData();
  }, [supabase, router]);

  const handleModelChange = async (modelId: LLMProvider) => {
    if (!userId || !orgId) return;

    setSelectedModel(modelId);
    setSaving(true);
    setSaved(false);

    // Save to organization_members (per-org preference)
    const { error } = await supabase
      .from("organization_members")
      .update({ llm_model: modelId })
      .eq("user_id", userId)
      .eq("org_id", orgId);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const groupedModels = MODEL_OPTIONS.reduce((acc, model) => {
    if (!acc[model.category]) acc[model.category] = [];
    acc[model.category].push(model);
    return acc;
  }, {} as Record<Category, ModelOption[]>);

  const categoryOrder: Category[] = ['fast', 'balanced', 'smart', 'reasoning', 'code'];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-8">
        {categoryOrder.map((category) => {
          const models = groupedModels[category];
          if (!models || models.length === 0) return null;
          const catConfig = CATEGORY_CONFIG[category];

          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <div className={cn("p-1.5 rounded-md bg-muted", catConfig.color)}>
                  {catConfig.icon}
                </div>
                <span className="text-sm font-medium text-foreground">{catConfig.label}</span>
              </div>

              <div className="space-y-2">
                {models.map((model) => (
                  <Card
                    key={model.id}
                    className={cn(
                      "transition-all cursor-pointer",
                      selectedModel === model.id
                        ? "ring-2 ring-foreground bg-muted/50"
                        : "hover:bg-muted/30"
                    )}
                    onClick={() => handleModelChange(model.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{model.name}</span>
                            {model.badge && (
                              <Badge variant="secondary" className="text-xs">
                                {model.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {model.description}
                          </p>
                        </div>
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-4",
                          selectedModel === model.id
                            ? "border-foreground bg-foreground"
                            : "border-muted-foreground/30"
                        )}>
                          {selectedModel === model.id && (
                            <Check className="w-3 h-3 text-background" />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save indicator */}
      <div className="h-6">
        {saving && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner size="sm" />
            <span className="text-sm">Saving...</span>
          </div>
        )}
        {saved && !saving && (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="w-4 h-4" />
            <span className="text-sm">Saved</span>
          </div>
        )}
      </div>
    </div>
  );
}
