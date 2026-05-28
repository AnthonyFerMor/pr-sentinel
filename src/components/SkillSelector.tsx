'use client';

import { useEffect, useState } from 'react';
import { SKILLS, resolveActiveSkills } from '@/lib/skills';

const STORAGE_KEY = 'pr-sentinel:skills';

/**
 * Lee los skills guardados en localStorage. Si no hay nada, devuelve los
 * default del catálogo. Exportado para que otras vistas reusen la selección.
 */
export function loadStoredSkills(): string[] {
  const defaults = resolveActiveSkills().map((skill) => skill.id);
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // Reject empty arrays — fall back to defaults so user always starts with skills active.
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((id) => typeof id === 'string')) {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return defaults;
}

function storeSkills(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota/availability errors
  }
}

interface SkillSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export default function SkillSelector({ selected, onChange, disabled }: SkillSelectorProps) {
  const [open, setOpen] = useState(true); // Open by default — skills are part of the core UX.
  const selectedSet = new Set(selected);

  // Persistir cada cambio de selección.
  useEffect(() => {
    storeSkills(selected);
  }, [selected]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(SKILLS.filter((skill) => next.has(skill.id)).map((skill) => skill.id));
  };

  const enableAll = () => onChange(SKILLS.map((s) => s.id));
  const disableAll = () => onChange([]);

  const activeCount = selectedSet.size;
  const totalCount = SKILLS.length;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-gray-900/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-200">
          <span className="text-violet-400">🧩</span>
          Review skills
          <span className={`rounded-full border px-2 py-0.5 text-xs ${
            activeCount === totalCount
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : activeCount === 0
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-violet-500/30 bg-violet-500/10 text-violet-300'
          }`}>
            {activeCount}/{totalCount} active
          </span>
        </span>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-white/5">
          <div className="flex items-center justify-between px-3 pt-3">
            <p className="text-xs text-gray-500">Pick what PR Sentinel should look for.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={enableAll}
                disabled={disabled || activeCount === totalCount}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enable all
              </button>
              <span className="text-gray-700">·</span>
              <button
                type="button"
                onClick={disableAll}
                disabled={disabled || activeCount === 0}
                className="text-xs text-gray-400 hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Disable all
              </button>
            </div>
          </div>

          <div className="grid gap-2 p-3 sm:grid-cols-2">
          {SKILLS.map((skill) => {
            const isOn = selectedSet.has(skill.id);
            return (
              <button
                key={skill.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(skill.id)}
                aria-pressed={isOn}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isOn
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-white/10 bg-gray-950/50 hover:border-white/20'
                }`}
              >
                <span className="text-lg leading-none">{skill.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{skill.name}</span>
                    <span
                      className={`inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 transition ${
                        isOn ? 'bg-violet-500' : 'bg-gray-700'
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-white transition ${
                          isOn ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-400">{skill.description}</span>
                </span>
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
