import { describe, expect, it } from 'vitest';
import { DEFAULT_STAND_CONFIG } from '../../src/data/templates';
import type { StandConfig, StandItem } from '../../src/types/stand';
import {
  checkWallCollision,
  findNearestAllowedPosition,
  isSolidWallItem,
} from '../../src/utils/wallCollision';

function makeItem(overrides: Partial<StandItem> = {}): StandItem {
  return {
    id: 'item-1',
    catalogId: 'reception-desk',
    name: 'Reception Desk',
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    dims: { w: 1.4, h: 1.05, d: 0.65 },
    artwork: {},
    ...overrides,
  };
}

describe('Wall Collision Detection & Snap-Back', () => {
  const inlineConfig: StandConfig = {
    ...DEFAULT_STAND_CONFIG,
    width: 6,
    depth: 4,
    openSides: 1, // Back, Left, and Right shell walls exist
    showShellWalls: true,
    shellWallHeight: 2.5,
  };

  it('detects collision against back, left, and right shell walls and snaps back inside bounds', () => {
    const desk = makeItem({ x: 0, z: 0 });

    // Cleanly inside
    expect(checkWallCollision(desk, 0, 0, inlineConfig, [desk]).collides).toBe(false);

    // Pushed through back wall (-depth/2 = -2)
    const backHit = checkWallCollision(desk, 0, -2.1, inlineConfig, [desk]);
    expect(backHit.collides).toBe(true);
    expect(backHit.collidedShellSides).toContain('back');

    const snapped = findNearestAllowedPosition(desk, 0, -2.1, inlineConfig, [desk]);
    expect(snapped.adjusted).toBe(true);
    expect(snapped.z).toBeGreaterThan(-2 + desk.dims.d / 2 - 0.01);
    expect(checkWallCollision(desk, snapped.x, snapped.z, inlineConfig, [desk]).collides).toBe(
      false
    );
  });

  it('respects Island stands (4 open sides) having no perimeter shell walls', () => {
    const islandConfig: StandConfig = {
      ...inlineConfig,
      openSides: 4,
    };
    const desk = makeItem();
    const hit = checkWallCollision(desk, 0, -2.0, islandConfig, [desk]);
    expect(hit.collidedShellSides).toHaveLength(0);
    expect(hit.collides).toBe(false);
  });

  it('detects OBB collision with placed solid wall items and snaps clear', () => {
    const wall = makeItem({
      id: 'wall-1',
      catalogId: 'modular-wall',
      name: 'Modular Wall',
      x: 0,
      z: -0.5,
      dims: { w: 2.0, h: 2.4, d: 0.16 },
    });
    expect(isSolidWallItem(wall)).toBe(true);

    const desk = makeItem({ id: 'desk-1', x: 0, z: 1.0 });
    const allItems = [wall, desk];

    // Drag desk right onto the modular wall
    const hit = checkWallCollision(desk, 0, -0.5, inlineConfig, allItems);
    expect(hit.collides).toBe(true);
    expect(hit.collidedWallItemIds).toContain('wall-1');

    const snapped = findNearestAllowedPosition(desk, 0, -0.5, inlineConfig, allItems);
    expect(snapped.adjusted).toBe(true);
    expect(checkWallCollision(desk, snapped.x, snapped.z, inlineConfig, allItems).collides).toBe(
      false
    );
  });

  it('allows overhead rigging items above floor walls without false collision', () => {
    const wall = makeItem({
      id: 'wall-1',
      catalogId: 'modular-wall',
      x: 0,
      z: 0,
      dims: { w: 2.0, h: 2.4, d: 0.16 },
    });
    const hanging = makeItem({
      id: 'sign-1',
      catalogId: 'hanging-cube',
      x: 0,
      y: 3.1,
      z: 0,
      dims: { w: 1.8, h: 0.8, d: 1.8 },
    });
    expect(checkWallCollision(hanging, 0, 0, inlineConfig, [wall, hanging]).collides).toBe(false);
  });
});
