export type MascotContext = 'dashboard' | 'editor';

export interface MascotTip {
  id: string;
  tag: string;
  text: string;
  context: 'all' | MascotContext;
}

export const MASCOT_STORAGE_KEY = 'standcraft_mascot_collapsed_v1';

export const MASCOT_TIPS: MascotTip[] = [
  {
    id: 'floor-welcome',
    tag: 'Quick Tip',
    text: 'Welcome to the show floor! Start from a template or open a blank stand, then drag gear straight onto the 3D floor.',
    context: 'dashboard',
  },
  {
    id: 'coffee-priority',
    tag: 'Show Floor Wisdom',
    text: 'Pro tip: Always leave space for a coffee counter. Scientifically, 80% of booth footfall is caffeine-driven.',
    context: 'all',
  },
  {
    id: 'camera-shortcuts',
    tag: 'Shortcut',
    text: 'Press V to select, O to orbit, H to pan, F to frame your stand, and 0 to reset the camera whenever you get lost.',
    context: 'editor',
  },
  {
    id: 'bounds-check',
    tag: 'Compliance',
    text: 'Keep an eye on the green "Within Bounds" pill top-left — venue ops love measuring overhangs with a tape measure.',
    context: 'editor',
  },
  {
    id: 'lanyard-wisdom',
    tag: 'Trade Show Pro',
    text: 'Comfortable shoes, a spare lanyard, and a clean sightline into your stand will beat a £50k laser show every time.',
    context: 'all',
  },
  {
    id: 'eye-level-check',
    tag: 'Design Hint',
    text: 'Switch to Eye-Level view in the top bar to see your stand exactly how a tired visitor walking down Aisle 4 sees it.',
    context: 'editor',
  },
  {
    id: 'snapshot-boss',
    tag: 'Quick Export',
    text: 'Need to impress the boss in 5 seconds? Hit the camera icon on the bottom dock for an instant high-res PNG render.',
    context: 'editor',
  },
  {
    id: 'open-sides',
    tag: 'Layout Tip',
    text: 'Got a corner or island plot? Open up your stand sides in Stand Details so visitors walk in instead of awkwardly making eye contact.',
    context: 'editor',
  },
  {
    id: 'branding-paint',
    tag: 'Branding',
    text: 'Upload your logo once in the Branding tab, then click any wall or counter to paint your artwork straight onto it.',
    context: 'editor',
  },
  {
    id: 'estimate-check',
    tag: 'Budget Hint',
    text: 'Click the live price in the top bar anytime to see your itemised build estimate and export a ready-to-send brief.',
    context: 'editor',
  },
  {
    id: 'undo-lifesaver',
    tag: 'Lifesaver',
    text: 'Accidentally moved the giant truss into the next hall? Hit Ctrl+Z (or Cmd+Z) — nobody saw a thing.',
    context: 'editor',
  },
  {
    id: 'duplicate-project',
    tag: 'Workflow',
    text: 'Pitching two layouts? Duplicate a project card from the dashboard to compare a budget build vs. the full VIP stand.',
    context: 'dashboard',
  },
];

export function getTipsForContext(context: MascotContext): MascotTip[] {
  return MASCOT_TIPS.filter((tip) => tip.context === 'all' || tip.context === context);
}

export function getNextTipIndex(currentIndex: number, total: number): number {
  if (total <= 1) return 0;
  return (currentIndex + 1) % total;
}

export function getRandomTipIndex(currentIndex: number, total: number, rng: () => number = Math.random): number {
  if (total <= 1) return 0;
  let next = Math.floor(rng() * total) % total;
  if (next === currentIndex) {
    next = (currentIndex + 1) % total;
  }
  return next;
}
