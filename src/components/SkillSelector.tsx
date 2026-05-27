'use client';

import { useEffect, useState } from 'react';
import { SKILLS, resolveActiveSkills } from '@/lib/skills';

const STORAGE_KEY = 'pr-sentinel:skills';

/**
 * Lee los skills guardados en localStorage. Si no hay nada, devuelve los
 * default del catálogo. Exportado para que otras vistas reusen la selección.
 */
export function loadStoredSkills(): string[] {
  if (typeof window === 'undefined') {
    return resolveActiveSkills().map((skill) => skill.id);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return resolveActiveSkills().map((skill) => skill.id);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return resolveActiveSkills().map((skill) => skill.id);
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
  const [open, setOpen] = useState(false);
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

  const activeCount = selectedSet.size;

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
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
            {activeCount} active
          </span>
        </span>
        <span className="text-gray-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="grid gap-2 border-t border-white/5 p-3 sm:grid-cols-2">
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
      )}
    </div>
  );
}
