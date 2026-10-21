import { h, render, Fragment } from '../../vendor/preact.js';
import htm from '../../vendor/htm.js';

export const html = htm.bind(h);
export { h, render, Fragment };
export {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
  useReducer,
} from '../../vendor/preact-hooks.js';
