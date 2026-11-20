import type { KeyboardEvent } from 'react';

/**
 * Keyboard activation for an element that is clickable but is not a
 * <button> (a card, a list option, a table row): Enter or Space runs the
 * same action as a click, as a native button would.
 */
export function activateOnKey(action: () => void) {
  return (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return; // a nested control handles its own keys
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}
