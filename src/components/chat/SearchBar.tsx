"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, FileText, Sparkles, X, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Source {
  document_id: string;
  title: string;
  snippet: string;
  similarity: number;
}


interface SearchBarProps {
  orgRef: string;
  onOpenDocument: (documentId: string) => void;
  sidebarWidth?: number;
  userAvatar?: string | null;
}

export function SearchBar({ orgRef, onOpenDocument, sidebarWidth = 220, userAvatar }: SearchBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [userQuestion, setUserQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
    setAnswer("");
    setSources([]);
    setUserQuestion("");
    setQuery("");
    // Clear sessionStorage
    sessionStorage.removeItem("chat_conversation");
  }, []);

  // Save conversation to sessionStorage
  useEffect(() => {
    if (userQuestion && answer && !isLoading) {
      sessionStorage.setItem("chat_conversation", JSON.stringify({
        userQuestion,
        answer,
        sources
      }));
    }
  }, [userQuestion, answer, sources, isLoading]);

  // Restore conversation from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("chat_conversation");
    if (saved) {
      try {
        const { userQuestion: q, answer: a, sources: s } = JSON.parse(saved);
        if (q && a) {
          setUserQuestion(q);
          setAnswer(a);
          setSources(s || []);
          setIsExpanded(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isExpanded && !isLoading) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isExpanded, isLoading, handleClose]);

  // Close on click outside (only if no conversation started)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isExpanded &&
        !isLoading &&
        !userQuestion &&
        !query.trim() &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded, isLoading, userQuestion, query]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsExpanded(true);
    setUserQuestion(query);
    setQuery("");
    setAnswer("");
    setSources([]);
    setIsLoading(true);

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query, org_ref: orgRef }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let currentEvent = "";
      let content = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) {
            currentEvent = line.replace("event: ", "").trim();
          } else if (line.startsWith("data: ") && line.length > 6) {
            try {
              const data = JSON.parse(line.replace("data: ", ""));
              if (currentEvent === "sources" && data.sources) {
                setSources(data.sources);
              } else if (currentEvent === "token" && data.content) {
                content += data.content;
                setAnswer(content);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setAnswer("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed z-50 flex justify-center"
      style={{
        left: sidebarWidth,
        right: 0,
        bottom: 64
      }}
    >
      <motion.div
        ref={containerRef}
        animate={{ width: isExpanded ? "min(700px, calc(100vw - 48px))" : "min(380px, calc(100vw - 48px))" }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div className="bg-background border border-border shadow-sm overflow-hidden">

          {/* Results Panel */}
          <AnimatePresence>
            {isExpanded && (userQuestion || isLoading) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <ScrollArea className="max-h-[350px] overflow-y-auto">
                  <div className="p-4 space-y-4 relative">
                    {/* Close button */}
                    <button
                      onClick={handleClose}
                      className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {/* User Question */}
                    <div className="flex gap-3 pr-6">
                      {userAvatar ? (
                        <img src={userAvatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                          U
                        </div>
                      )}
                      <p className="text-sm pt-1">{userQuestion}</p>
                    </div>

                    {/* Answer */}
                    {(answer || isLoading) && (
                      <div className="flex gap-3">
                        <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center shrink-0">
                          {isLoading && !answer ? <Spinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 pt-1 min-w-0">
                          {answer ? (
                            <p className="text-sm whitespace-pre-wrap break-words font-mono">
                              {answer.split(/(\[\d+\])/).map((part, i) => {
                                const match = part.match(/\[(\d+)\]/);
                                if (match) {
                                  const num = parseInt(match[1]);
                                  const source = sources[num - 1];
                                  if (source) {
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => onOpenDocument(source.document_id)}
                                        className="inline-flex items-center justify-center w-4 h-4 text-[10px] bg-primary text-primary-foreground rounded-sm mx-0.5 hover:bg-primary/80 transition-colors"
                                      >
                                        {num}
                                      </button>
                                    );
                                  }
                                }
                                return part;
                              })}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Searching...</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sources - deduplicated by document_id */}
                    {sources.length > 0 && answer && !isLoading && (() => {
                      const uniqueSources = sources.filter(
                        (s, i, arr) => arr.findIndex(x => x.document_id === s.document_id) === i
                      );
                      return (
                        <div className="pt-3 mt-3 border-t">
                          <p className="text-xs text-muted-foreground mb-2">Sources</p>
                          <div className="space-y-1.5">
                            {uniqueSources.map((s, i) => (
                              <button
                                key={s.document_id}
                                onClick={() => onOpenDocument(s.document_id)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded transition-colors text-left"
                              >
                                <span className="w-5 h-5 bg-primary text-primary-foreground rounded flex items-center justify-center text-[10px] shrink-0">{i + 1}</span>
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{s.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Input */}
          <form onSubmit={handleSubmit}>
            <div className={cn(
              "flex items-center gap-3 px-4 py-3",
              isExpanded && (userQuestion || isLoading) && "border-t"
            )}>
              <div className="w-8 h-8 flex items-center justify-center text-primary">
                <Sparkles className="w-5 h-5" />
              </div>

              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => !isExpanded && setIsExpanded(true)}
                placeholder="Search with AI..."
                disabled={isLoading}
                className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/60 text-left"
              />

              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleStop}
                  className="h-8 w-8"
                >
                  <Square className="w-3 h-3 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!query.trim()}
                  className="h-8 w-8"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
