import { useCallback } from 'react';

/**
 * Returns a stable ref callback that moves focus to an element as soon as React
 * attaches it to the DOM.
 *
 * Preferred over the `autoFocus` prop: `autoFocus` only fires on the initial
 * commit, so under StrictMode's development double-mount (and when the field is
 * rendered asynchronously, like the Welcome step's setup-token input) the focus
 * is dropped. A ref callback re-runs on every attach — including the StrictMode
 * reattach — so focus reliably lands on the first field of each wizard step and
 * moves off the persistent Back/Next buttons.
 *
 * The callback is memoised with an empty dependency list so it does not re-fire
 * on every render (which would steal focus back while the user is typing).
 */
export function useAutoFocus<T extends HTMLElement>() {
    return useCallback((el: T | null) => {
        el?.focus();
    }, []);
}
