import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { ChefHat, ChevronLeft, ChevronRight, Clock, X, Square } from 'lucide-react';
import { cookingSteps, timerState } from './cooking-utils.js';

function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

export function useCookingTimers(userId) {
  const key = `homecooked-timers-${userId || 'guest'}`;
  const [timers, setTimers] = useState(() => stored(key, []));
  const [now, setNow] = useState(Date.now());
  const currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
    setTimers(stored(key, []));
  }, [key]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);
  function update(transform) {
    setTimers(previous => {
      const next = transform(previous);
      localStorage.setItem(currentKey.current, JSON.stringify(next));
      return next;
    });
  }
  return {
    timers, now,
    addTimer(title, minutes) {
      const duration = Number(minutes) * 60000;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 86400000) return;
      const start = Date.now();
      update(list => [...list, { id: `${start}-${Math.random()}`, title: title.trim() || 'Cooking timer', duration, endsAt: start + duration }]);
    },
    stopTimer(id) { update(list => list.map(timer => timer.id === id ? { ...timer, stoppedRemaining: timerState(timer, Date.now()).remaining } : timer)); },
    closeTimer(id) { update(list => list.filter(timer => timer.id !== id)); },
  };
}

export function TimerBanners({ timers, now, stopTimer, closeTimer }) {
  if (!timers.length) return null;
  return <div className="timer-banners" aria-label="Cooking timers">{timers.map(timer => {
    const state = timerState(timer, now);
    const stopped = timer.stoppedRemaining !== undefined;
    return <div key={timer.id} className={`timer-banner timer-${state.color}`}>
      <div className="timer-fill" style={{ width: `${state.progress * 100}%` }} />
      <div role="progressbar" aria-label={timer.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress * 100)} aria-valuetext={`${state.text} remaining${stopped ? ', stopped' : ''}`} className="timer-label"><Clock size={18}/><strong>{timer.title}</strong></div>
      <span className="timer-count">{stopped ? 'Stopped · ' : state.remaining === 0 ? 'Done · ' : ''}{state.text}</span>
      {!stopped && state.remaining > 0 && <button className="icon-button" aria-label={`Stop ${timer.title}`} onClick={() => stopTimer(timer.id)}><Square size={17}/></button>}
      <button className="icon-button" aria-label={`Close ${timer.title}`} onClick={() => closeTimer(timer.id)}><X size={19}/></button>
    </div>;
  })}</div>;
}

export default function CookMode({ data, api, action, busy, setNotice, addTimer, imageInput, wake, setWake, goToPlanner, initialSelected }) {
  const meals = data.meals.filter(meal => ['Prepping', 'Cooking'].includes(meal.status));
  const entries = meals.flatMap(meal => meal.recipeIds.map(id => ({ meal, recipe: data.recipes.find(recipe => recipe.id === id), id, key: `${meal.id}:${id}` })));
  const [selected, setSelected] = useState(initialSelected || '');
  const current = entries.find(entry => entry.key === selected) || entries[0];
  const index = current ? entries.indexOf(current) : 0;
  const [document, setDocument] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [checks, setChecks] = useState(() => stored('homecooked-cooking-steps', {}));
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const touch = useRef(null);
  const lastIndexRef = useRef(index);
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setDocument(null); setError('');
    api(`/recipes/${current.id}/markdown`).then(result => {
      if (!cancelled) setDocument({ key: current.key, body: result.body });
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [current?.key, retry]);
  function move(direction) {
    if (entries[index + direction]) {
      setIsTransitioning(true);
      setSelected(entries[index + direction].key);
      lastIndexRef.current = index + direction;
      setTimeout(() => setIsTransitioning(false), 300);
    }
  }
  function toggleStep(step) {
    const key = `${current.key}:${step}`;
    setChecks(previous => {
      const next = { ...previous, [key]: !previous[key] };
      localStorage.setItem('homecooked-cooking-steps', JSON.stringify(next));
      return next;
    });
  }
  if (!current) return <div className="empty"><ChefHat size={38}/><h2>Nothing cooking right now</h2><p>Start a meal from the meal planner to bring its recipes here.</p><button onClick={goToPlanner}>Go to meal planner</button></div>;
  const ready = document?.key === current.key;
  const recipeReady = (current.meal.readyRecipeIds || []).includes(current.id);
  return <section className="cook-workspace">
    <div className="meal-completion-list">{meals.map(meal => {
      const count = meal.recipeIds.filter(id => (meal.readyRecipeIds || []).includes(id)).length;
      const allReady = count === meal.recipeIds.length && count > 0;
      return <div className="panel meal-completion" key={meal.id}>
        <div><h3>{meal.name}</h3><p>{count} of {meal.recipeIds.length} recipes ready{allReady ? ' — ready to finish.' : '.'}</p></div>
        <button disabled={busy || !allReady} onClick={() => action(() => api(`/meals/${meal.id}`, 'PATCH', { complete: true }))}>Mark everything done</button>
      </div>;
    })}</div>
    <div className="filters cook-tabs" aria-label="Active recipes">{entries.map(entry => <button key={entry.key} aria-pressed={entry.key === current.key} className={entry.key === current.key ? 'selected' : ''} onClick={() => setSelected(entry.key)}>{(entry.meal.readyRecipeIds || []).includes(entry.id) ? '✓ ' : ''}{entry.recipe?.name || 'Recipe'} <small>· {entry.meal.name}</small></button>)}</div>
    <div className={`panel cook-recipe${isTransitioning ? ' transitioning' : ''}`} style={{ '--slide-direction': lastIndexRef.current > index ? '-1' : '1' }} onTouchStart={event => { if (event.target.closest('button,input,textarea,select,a')) return; const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={event => {
      if (!touch.current) return;
      const point = event.changedTouches[0]; const dx = point.clientX - touch.current.x; const dy = point.clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    }}>
      <div className="cook-pager"><button className="secondary" aria-label="Previous recipe" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft/></button><span>{index + 1} / {entries.length} · Swipe to switch recipes</span><button className="secondary" aria-label="Next recipe" disabled={index === entries.length - 1} onClick={() => move(1)}><ChevronRight/></button></div>
      <div className="section-heading"><div><span className="eyebrow">{current.meal.name}</span><h2>{current.recipe?.name || 'Recipe'}</h2></div><span className="status">{current.meal.status}</span></div>
      <div className="row">
        {current.meal.status === 'Prepping' && <button onClick={() => action(() => api(`/meals/${current.meal.id}`, 'PATCH', { status: 'Cooking' }))}>Start cooking</button>}
        <button className="secondary" disabled={busy} aria-pressed={recipeReady} onClick={() => action(() => api(`/meals/${current.meal.id}`, 'PATCH', { recipeReady: { recipeId: current.id, ready: !recipeReady } }))}>{recipeReady ? '✓ Recipe ready — undo' : 'Mark recipe ready'}</button>
        <button className="secondary" onClick={async () => { try { if (wake) { await wake.release(); setWake(null); } else { const lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => setWake(null)); setWake(lock); } } catch { setNotice('Screen wake lock is unavailable on this device.'); } }}>{wake ? 'Screen staying on' : 'Keep screen on'}</button>
        {imageInput('meals', current.meal.id)}
      </div>
      {!ready && !error && <p role="status">Loading recipe…</p>}
      {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      {ready && <div className="markdown cook-markdown"><Markdown remarkPlugins={[cookingSteps]} components={{ li: ({ node, children, ...props }) => {
        const step = node.properties?.['data-cook-step'];
        if (step === undefined) return <li>{children}</li>;
        const checked = !!checks[`${current.key}:${step}`];
        return <li className={`cook-step ${checked ? 'step-done' : ''}`}><div role="checkbox" aria-checked={checked} tabIndex={0} onClick={event => { if (!event.target.closest('a')) toggleStep(step); }} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleStep(step); } }}><span className="step-check" aria-hidden="true">{checked ? '✓' : ''}</span><div>{children}</div></div></li>;
      } }}>{document.body}</Markdown></div>}
      <form key={current.key} className="cook-timer-form" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); addTimer(String(values.get('title')), values.get('minutes')); setNotice('Timer started'); }}>
        <h3>Set a timer</h3><div className="row"><label>Title<input name="title" defaultValue={current.recipe?.name || 'Cooking timer'} required maxLength={120}/></label><label>Minutes<input name="minutes" type="number" defaultValue="10" min="0.1" max="1440" step="0.1" required/></label><button><Clock size={17}/>Start timer</button></div>
      </form>
      <form className="cook-notes" onSubmit={async event => {
        event.preventDefault(); const key = current.key; setSaving(true);
        try { const result = await api(`/recipes/${current.id}/notes`, 'POST', { note: drafts[key] }); setDocument(previous => previous?.key === key ? { key, body: result.body } : previous); setDrafts(previous => ({ ...previous, [key]: '' })); setNotice('Note saved to the recipe'); }
        catch (error) { setNotice(error.message); } finally { setSaving(false); }
      }}><label>Add a recipe note<textarea rows={3} maxLength={10000} placeholder="What worked? What would you change next time?" value={drafts[current.key] || ''} onChange={event => setDrafts({ ...drafts, [current.key]: event.target.value })}/></label><button disabled={saving || !drafts[current.key]?.trim()}>Save note</button></form>
    </div>
  </section>;
}
