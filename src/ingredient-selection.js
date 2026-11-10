export function selectedIngredient(markdown, start, end) {
  if (start === end) return '';
  const headings = [];
  let offset = 0;
  let fence = null;
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    } else if (!fence) {
      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) headings.push({ start: offset, end: offset + line.length + 1, level: heading[1].length, title: heading[2] });
    }
    offset += line.length + 1;
  }
  const section = headings.find(heading => {
    if (!/^ingredients?\b/i.test(heading.title) || start < heading.end) return false;
    const next = headings.find(other => other.start > heading.start && other.level <= heading.level);
    return end <= (next?.start ?? markdown.length);
  });
  return section ? cleanIngredient(markdown.slice(start, end)) : '';
}

export function cleanIngredient(text) {
  return text.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').replace(/\s+/g, ' ').trim();
}
