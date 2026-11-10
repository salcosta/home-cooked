import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cleanIngredient, selectedIngredient } from './ingredient-selection.js';

export default function IngredientCapture({ enabled, recipe, api, action, busy, setNotice, children }) {
  const [selection, setSelection] = useState('');
  function capture(event) {
    if (!enabled || !window.matchMedia('(min-width: 761px)').matches) return;
    if (event.target.closest('.ingredient-selection-action')) return;
    const textarea = event.target.closest('textarea');
    if (textarea) {
      setSelection(selectedIngredient(textarea.value, textarea.selectionStart, textarea.selectionEnd));
      return;
    }
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) { setSelection(''); return; }
    const range = selected.getRangeAt(0);
    const container = event.currentTarget;
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) { setSelection(''); return; }
    const headings = [...container.querySelectorAll('.markdown h1,.markdown h2,.markdown h3,.markdown h4,.markdown h5,.markdown h6')];
    const inside = headings.some((heading, index) => {
      if (!/^ingredients?\b/i.test(heading.textContent.trim())) return false;
      const section = document.createRange();
      section.setStartAfter(heading);
      const next = headings.slice(index + 1).find(other => Number(other.tagName[1]) <= Number(heading.tagName[1]));
      if (next) section.setEndBefore(next); else section.setEndAfter(container.querySelector('.markdown').lastChild);
      return section.comparePoint(range.startContainer, range.startOffset) === 0 && section.comparePoint(range.endContainer, range.endOffset) === 0;
    });
    setSelection(inside ? cleanIngredient(selected.toString()) : '');
  }
  const ingredients = recipe?.ingredients || [];
  const duplicate = ingredients.some(item => item.trim().toLowerCase() === selection.toLowerCase());
  return <div className="ingredient-capture" onMouseUp={capture} onKeyUp={capture} onSelect={capture}>
    {children}
    {enabled && selection && <div className="ingredient-selection-action" role="region" aria-label="Selected ingredient" onMouseDown={event => event.preventDefault()}>
      <span title={selection}>{selection}</span>
      <button type="button" disabled={busy || duplicate} onClick={() => action(async () => {
        await api(`/recipes/${recipe.id}`, 'PATCH', { ingredients: [...ingredients, selection] });
        setSelection(''); setNotice('Ingredient added to this recipe');
      })}><Plus size={17}/>{duplicate ? 'Already added' : 'Add to ingredients'}</button>
      <button type="button" className="icon-button" aria-label="Dismiss ingredient selection" onClick={() => setSelection('')}><X size={18}/></button>
    </div>}
    {enabled && <div className="captured-ingredients"><h3>Recipe ingredients</h3><p>On desktop, highlight text under Ingredients to add it here.</p>{ingredients.length ? <div className="recipe-tags">{ingredients.map((item, index) => <span key={index}>{item}</span>)}</div> : <small>No ingredients added yet.</small>}</div>}
  </div>;
}
