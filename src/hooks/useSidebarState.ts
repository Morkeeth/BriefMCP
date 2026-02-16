"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "sidebar-expanded";
const EVENT_NAME = "sidebar-state-change";

// Helper to read localStorage safely
function getStoredValue(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== null ? stored === "true" : defaultValue;
}

// Subscribe to storage and custom events
function subscribe(callback: () => void) {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  const handleCustomEvent = () => callback();

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(EVENT_NAME, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(EVENT_NAME, handleCustomEvent);
  };
}

export function useSidebarState(defaultExpanded = true) {
  const [isHydrated, setIsHydrated] = useState(false);

  // Use useSyncExternalStore for localStorage synchronization
  const isExpanded = useSyncExternalStore(
    subscribe,
    () => getStoredValue(defaultExpanded),
    () => defaultExpanded // Server snapshot
  );

  // Mark as hydrated on first client render
  useSyncExternalStore(
    () => () => {},
    () => {
      if (!isHydrated) setIsHydrated(true);
      return true;
    },
    () => false
  );

  const toggle = useCallback(() => {
    const newValue = !getStoredValue(defaultExpanded);
    localStorage.setItem(STORAGE_KEY, String(newValue));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: newValue }));
  }, [defaultExpanded]);

  const setExpanded = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value }));
  }, []);

  return { isExpanded, toggle, setExpanded, isHydrated };
}
