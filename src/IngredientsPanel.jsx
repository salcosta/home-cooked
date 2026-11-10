import React, { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';

export default function IngredientsPanel({ data, api, action, busy, imageInput, setNotice }) {
  const [query, setQuery] = useState('');
  const ingredients = data.ingredients.filter(item => `${item.displayName || item.name} ${item.name}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="section-heading"><div><h2>Ingredients</h2><p>Clean up display names, set prices, and manage pictures.</p></div><label className="search"><Search size={18}/><input aria-label="Search ingredients" placeholder="Search ingredients…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <div className="admin-grid">{ingredients.map(item => <form className="panel ingredient-editor" key={item.id} onSubmit={event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      action(async () => { await api(`/ingredients/${item.id}`, 'PATCH', values); setNotice('Ingredient saved'); });
    }}>
      {item.image ? <img className="ingredient-picture" src={item.image} alt={item.displayName || item.name}/> : <div className="ingredient-picture ingredient-no-picture">No picture</div>}
      <small>Recipe name: {item.name}</small>
      <label>Display name<input name="displayName" defaultValue={item.displayName || item.name} required maxLength={200}/></label>
      <label>Price<input name="price" type="number" min="0" step="0.01" defaultValue={item.price} placeholder="Not set"/></label>
      <div className="row">{imageInput('ingredients', item.id, item.image ? 'Change picture' : 'Add picture')}{item.image && <button type="button" className="secondary danger" disabled={busy} onClick={() => action(() => api(`/ingredients/${item.id}`, 'PATCH', { removeImage: true }))}><Trash2 size={16}/>Remove picture</button>}</div>
      <button disabled={busy}>Save ingredient</button>
    </form>)}</div>
    {!ingredients.length && <div className="empty">{query ? 'No matching ingredients.' : 'Ingredients added to recipes or the shopping list will appear here.'}</div>}
  </>;
}
