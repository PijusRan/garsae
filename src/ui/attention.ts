// Whether the user can be looking at the page: the window has focus and the tab is showing. While they work in
// another window the animations rest, because redrawing the background re-blurs every glass tile over it.

import { useEffect, useState } from 'react';

let focused = document.hasFocus() && !document.hidden;
const listeners = new Set<() => void>();

const update = () => {
  const now = document.hasFocus() && !document.hidden;
  if (now === focused) return;
  focused = now;
  listeners.forEach((listener) => listener());
};
window.addEventListener('focus', update);
window.addEventListener('blur', update);
document.addEventListener('visibilitychange', update);

export const isFocused = (): boolean => focused;

/** Calls back whenever focus comes or goes. Returns the unsubscribe. */
export function onFocusChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFocused(): boolean {
  const [value, setValue] = useState(focused);
  useEffect(() => {
    setValue(focused);
    return onFocusChange(() => setValue(focused));
  }, []);
  return value;
}
