/** In-memory section navigation for one mounted patient window, never clinical undo. */
export function createSectionHistory() {
  const entries: string[] = [];
  let index = -1;
  const limit = 80;

  return {
    get canBack() { return index > 0; },
    get canForward() { return index >= 0 && index < entries.length - 1; },
    visit(current: string, next: string) {
      if (current === next) return;
      // Seed from the actual section, including restored windows.
      if (entries[index] !== current) {
        entries.splice(index + 1);
        entries.push(current);
        index = entries.length - 1;
      }
      entries.splice(index + 1);
      entries.push(next);
      if (entries.length > limit) entries.splice(0, entries.length - limit);
      index = entries.length - 1;
    },
    peek(direction: -1 | 1) {
      return entries[index + direction];
    },
    move(direction: -1 | 1) {
      const target = index + direction;
      if (target < 0 || target >= entries.length) return;
      index = target;
      return entries[index];
    },
  };
}
