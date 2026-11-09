const svg = (d: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  jump: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  sprint: svg('<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>'),
  fly: svg('<path d="M4 20L15 9M13 5l6 6M17 3l4 4-3 3M4 20l1.5-6M4 20l6-1.5"/>'),
  quality: svg('<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>'),
  debug: svg('<path d="M4 19V10M10 19V5M16 19v-7M21 19H3"/>'),
  mouse: svg('<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>'),
  mic: svg(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  ),
  micOff: svg(
    '<path d="M9 9v2a3 3 0 005 2.2M15 10V6a3 3 0 00-5.7-1.3M5 11a7 7 0 0011 5.7M19 11a7 7 0 01-.6 2.8M12 18v3M4 3l16 18"/>',
  ),
  book: svg('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13M9 8h6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  users: svg(
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6M16 4.8a3.2 3.2 0 010 6.4M18 14.6c1.9.6 3 2.6 3 5.4"/>',
  ),
  atk: svg(
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
  ),
} as const;
