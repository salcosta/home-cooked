export function timerState(timer, now) {
  const remaining = Math.max(0, timer.stoppedRemaining ?? timer.endsAt - now);
  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.duration));
  const color = progress >= .9 ? 'red' : progress >= .75 ? 'yellow' : progress >= .4 ? 'green' : 'blue';
  const seconds = Math.ceil(remaining / 1000);
  return { remaining, progress, color, text: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` };
}

// Mark ordered instructions and bullets under a Method/Steps/Instructions heading.
export function cookingSteps() {
  return tree => {
    let instructionSection = false;
    let step = 0;
    for (const node of tree.children) {
      if (node.type === 'heading') {
        const text = node.children.map(child => child.value || '').join('');
        instructionSection = /method|steps|instructions|directions|preparation/i.test(text);
      }
      if (node.type !== 'list' || (!node.ordered && !instructionSection)) continue;
      for (const item of node.children) {
        item.data = { ...item.data, hProperties: { 'data-cook-step': String(step++) } };
      }
    }
  };
}
