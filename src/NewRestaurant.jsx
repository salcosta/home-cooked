import React from 'react';
import { Plus } from 'lucide-react';

export default function NewRestaurant({ api, action, busy, setNotice }) {
  return <form className="panel" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    action(async () => {
      await api('/restaurants', 'POST', fields);
      form.reset();
      setNotice('Restaurant added. You can now assign recipes and upload its pictures.');
    });
  }}>
    <h3>Add a restaurant</h3>
    <label>Name<input name="name" maxLength={120} required placeholder="e.g. Friday Night Tacos"/></label>
    <label>Cuisine<input name="cuisine" maxLength={80} placeholder="e.g. Mexican"/></label>
    <label>Description<input name="description" maxLength={300} placeholder="What makes this kitchen special?"/></label>
    <label>Logo emoji<input name="logo" maxLength={40} defaultValue="🍽️"/></label>
    <p>Add a header photo or logo after creating your restaurant.</p>
    <button disabled={busy}><Plus size={17}/>Add restaurant</button>
  </form>;
}
