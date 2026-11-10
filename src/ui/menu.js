// Menu model shared by game logic and the renderer (single source of truth).
export const MENU_ITEMS = [
  { id: '1P', label: '1 PLAYER', hint: 'W/A/S/D + SPACE' },
  { id: '2P', label: '2 PLAYERS', hint: 'ARROWS + ENTER' },
  { id: 'DEMO', label: 'DEMO', hint: 'WATCH THE AI FIGHT' },
  { id: 'HELP', label: 'HELP', hint: 'CONTROLS & RULES' },
  { id: 'CLEAR', label: 'CLEAR DATA', hint: 'RESET SAVE DATA' },
];

export function menuChoice(index) {
  const item = MENU_ITEMS[index];
  return item ? item.id : null;
}
