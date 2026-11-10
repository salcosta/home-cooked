export function appendRecipeNote(markdown, note) {
  if (typeof note !== 'string' || !note.trim() || note.length > 10000) {
    throw Error('A note between 1 and 10000 characters is required.');
  }
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let fence = null;
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) headings.push({ index: i, level: heading[1].length, title: heading[2] });
  }
  const notes = headings.find(h => /^notes$/i.test(h.title));
  let previous = '';
  if (notes) {
    const end = headings.find(h => h.index > notes.index && h.level <= notes.level)?.index ?? lines.length;
    previous = lines.slice(notes.index + 1, end).join('\n').trim();
    lines.splice(notes.index, end - notes.index);
  }
  // Keep notes at the bottom, retaining any existing notes and subsequent sections.
  const entry = '- ' + note.trim().split(/\r?\n/).join('\n  ');
  return `${lines.join('\n').trimEnd()}\n\n## Notes\n\n${previous ? previous + '\n\n' : ''}${entry}\n`;
}
