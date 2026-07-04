import { useState, type FormEvent } from 'react';
import type { PortfolioSkill, PortfolioVisibility } from '../types';

interface SkillsManagerProps {
  skills: PortfolioSkill[];
  onChange: (skills: PortfolioSkill[]) => void;
}

type SkillDraft = Omit<PortfolioSkill, 'id' | 'sortOrder'>;

const emptyDraft: SkillDraft = {
  name: '',
  category: '',
  level: '',
  description: '',
  visibility: 'public'
};

const normalizeSkillOrder = (items: PortfolioSkill[]) => (
  items.map((item, index) => ({
    ...item,
    sortOrder: index
  }))
);

const getSortedSkills = (items: PortfolioSkill[]) => (
  [...items].sort((a, b) => a.sortOrder - b.sortOrder)
);

export default function SkillsManager({ skills, onChange }: SkillsManagerProps) {
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState('');

  const sortedSkills = getSortedSkills(skills);

  const updateDraft = (field: keyof SkillDraft, value: string) => {
    setDraft(current => ({
      ...current,
      [field]: value
    }));
  };

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
    setValidationMessage('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    setValidationMessage('');
    if (!name) {
      setValidationMessage('Add a skill name before adding this skill.');
      return;
    }

    const cleanDraft: SkillDraft = {
      name,
      category: draft.category?.trim(),
      level: draft.level?.trim(),
      description: draft.description?.trim(),
      visibility: draft.visibility
    };

    if (editingId) {
      onChange(normalizeSkillOrder(sortedSkills.map(item => (
        item.id === editingId ? { ...item, ...cleanDraft } : item
      ))));
      resetDraft();
      return;
    }

    onChange(normalizeSkillOrder([
      ...sortedSkills,
      {
        ...cleanDraft,
        id: 'skill_' + Date.now(),
        sortOrder: sortedSkills.length
      }
    ]));
    resetDraft();
  };

  const startEdit = (skill: PortfolioSkill) => {
    setDraft({
      name: skill.name,
      category: skill.category || '',
      level: skill.level || '',
      description: skill.description || '',
      visibility: skill.visibility
    });
    setEditingId(skill.id);
  };

  const deleteSkill = (id: string) => {
    onChange(normalizeSkillOrder(sortedSkills.filter(item => item.id !== id)));
    if (editingId === id) resetDraft();
  };

  const toggleVisibility = (id: string) => {
    onChange(sortedSkills.map(item => {
      if (item.id !== id) return item;
      const nextVisibility: PortfolioVisibility = item.visibility === 'public' ? 'private' : 'public';
      return {
        ...item,
        visibility: nextVisibility
      };
    }));
  };

  return (
    <section className="bg-surface-container-low border border-surface-container-high rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
          Portfolio Studio
        </p>
        <h3 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
          Skills
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Skill Name</span>
          <input type="text" required value={draft.name} onChange={event => updateDraft('name', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
          {validationMessage && <p className="font-sans text-xs font-bold text-secondary">{validationMessage}</p>}
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Category</span>
          <input type="text" value={draft.category || ''} onChange={event => updateDraft('category', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary" />
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Level</span>
          <select value={draft.level || ''} onChange={event => updateDraft('level', event.target.value)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="">Select level</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Expert">Expert</option>
          </select>
        </label>

        <label className="block space-y-2">
          <span className="font-sans text-xs font-extrabold text-primary">Visibility</span>
          <select value={draft.visibility} onChange={event => updateDraft('visibility', event.target.value as PortfolioVisibility)} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary">
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>

        <label className="block space-y-2 md:col-span-2">
          <span className="font-sans text-xs font-extrabold text-primary">Description</span>
          <textarea value={draft.description || ''} onChange={event => updateDraft('description', event.target.value)} rows={3} className="w-full rounded-xl border border-surface-container-high bg-white px-4 py-3 font-sans text-sm font-bold text-on-surface outline-none focus:border-primary resize-none" />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary active:scale-95 transition-all">
            {editingId ? 'Save Skill' : 'Add Skill'}
          </button>
          {editingId && (
            <button type="button" onClick={resetDraft} className="rounded-full border border-surface-container-high px-6 py-3 font-sans text-xs font-extrabold text-primary active:scale-95 transition-all">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedSkills.length > 0 ? sortedSkills.map(skill => (
          <article key={skill.id} className="rounded-2xl border border-surface-container-high bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.18em] text-secondary">
                  {skill.visibility === 'public' ? 'Public' : 'Private'}
                </p>
                <h4 className="font-display text-2xl font-bold text-primary tracking-tight mt-1">
                  {skill.name}
                </h4>
                {(skill.category || skill.level) && (
                  <p className="font-sans text-sm font-bold text-on-surface-variant">
                    {[skill.category, skill.level].filter(Boolean).join(' | ')}
                  </p>
                )}
              </div>
            </div>

            {skill.description && (
              <p className="font-sans text-sm font-bold text-on-surface-variant">
                {skill.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleVisibility(skill.id)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Toggle Visibility</button>
              <button type="button" onClick={() => startEdit(skill)} className="rounded-full border border-surface-container-high px-3 py-2 font-sans text-xs font-extrabold text-primary">Edit</button>
              <button type="button" onClick={() => deleteSkill(skill.id)} className="rounded-full bg-secondary/10 px-3 py-2 font-sans text-xs font-extrabold text-secondary">Delete</button>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-surface-container-high bg-white p-6 text-center md:col-span-2">
            <p className="font-sans text-sm font-bold text-on-surface-variant">
              No skills added yet. Add a skill to highlight your strengths.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
