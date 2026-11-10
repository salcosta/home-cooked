import React from 'react';
import { Plus } from 'lucide-react';

export default function TagsPanel({ data, api, action, busy }) {
  return <>
    <h2>Recipe tags</h2>
    <p>Create reusable labels such as Vegetarian, Quick dinner, or Family favorite. Assign them when editing a recipe.</p>
    <form className="panel tag-create" onSubmit={event => {
      event.preventDefault();
      const form = event.currentTarget;
      const name = new FormData(form).get('name');
      action(async () => { await api('/tags', 'POST', { name }); form.reset(); });
    }}>
      <label htmlFor="new-tag-name">Tag name</label>
      <div className="row"><input id="new-tag-name" name="name" placeholder="e.g. Quick dinner" maxLength={50} required/><button disabled={busy}><Plus size={17}/>Create tag</button></div>
    </form>
    <div className="tag-catalog">{data.tags.map(tag => <div className="panel tag-entry" key={tag.id}><strong>{tag.name}</strong><small>{data.recipes.filter(recipe => !recipe.archived && recipe.tagIds?.includes(tag.id)).length} recipes</small></div>)}</div>
    {!data.tags.length && <div className="empty">No tags yet. Create your first tag above.</div>}
  </>;
}
