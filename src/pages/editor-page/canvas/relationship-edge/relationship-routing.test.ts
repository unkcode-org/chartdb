import { describe, expect, it } from 'vitest';
import {
    arrangeRelationshipRoutes,
    getRoutePath,
    type Point,
    type Rect,
    type RouteRequest,
} from './relationship-routing';

const obstacles: Rect[] = [
    { left: 0, right: 100, top: 0, bottom: 100 },
    { left: 150, right: 250, top: -80, bottom: 180 },
    { left: 300, right: 400, top: 0, bottom: 100 },
];

const request = (id: string, y: number): RouteRequest => ({
    id,
    source: { x: 100, y },
    target: { x: 300, y },
    sourceSide: 'right',
    targetSide: 'left',
});

const segments = (points: Point[]) =>
    points.slice(1).map((point, index) => ({ from: points[index], to: point }));

const overlap = (
    a: { from: Point; to: Point },
    b: { from: Point; to: Point }
) => {
    if (a.from.x === a.to.x && b.from.x === b.to.x && a.from.x === b.from.x) {
        return Math.max(
            0,
            Math.min(Math.max(a.from.y, a.to.y), Math.max(b.from.y, b.to.y)) -
                Math.max(Math.min(a.from.y, a.to.y), Math.min(b.from.y, b.to.y))
        );
    }
    if (a.from.y === a.to.y && b.from.y === b.to.y && a.from.y === b.from.y) {
        return Math.max(
            0,
            Math.min(Math.max(a.from.x, a.to.x), Math.max(b.from.x, b.to.x)) -
                Math.max(Math.min(a.from.x, a.to.x), Math.min(b.from.x, b.to.x))
        );
    }
    return 0;
};

describe('relationship routing', () => {
    it('routes around the table between endpoints', () => {
        const route = arrangeRelationshipRoutes(
            [request('first', 40)],
            obstacles
        ).first;
        expect(route.points[0]).toEqual({ x: 100, y: 40 });
        expect(route.points.at(-1)).toEqual({ x: 300, y: 40 });
        expect(
            route.points.some((point) => point.y <= -92 || point.y >= 192)
        ).toBe(true);
    });

    it('separates full routes, including their vertical sections', () => {
        const routes = arrangeRelationshipRoutes(
            [request('first', 40), request('second', 70)],
            obstacles
        );
        expect(routes.first).toBeDefined();
        expect(routes.second).toBeDefined();
        const first = segments(routes.first.points);
        const second = segments(routes.second.points);
        // Entry and exit stubs can meet at a field. Interior sections must not stack.
        for (const a of first.slice(1, -1)) {
            for (const b of second.slice(1, -1)) {
                expect(overlap(a, b)).toBe(0);
            }
        }
    });

    it('branches parallel relationships that share both fields', () => {
        const routes = arrangeRelationshipRoutes(
            [request('first', 40), request('second', 40)],
            obstacles
        );
        expect(routes.first.points).not.toEqual(routes.second.points);
        for (const a of segments(routes.first.points).slice(1, -1)) {
            for (const b of segments(routes.second.points).slice(1, -1)) {
                expect(overlap(a, b)).toBe(0);
            }
        }
    });

    it('keeps a bundle of six parallel relationships on separate tracks', () => {
        const ids = Array.from(
            { length: 6 },
            (_, index) => `relation-${index}`
        );
        const routes = arrangeRelationshipRoutes(
            ids.map((id) => request(id, 40)),
            obstacles
        );
        expect(Object.keys(routes)).toHaveLength(ids.length);
        for (let first = 0; first < ids.length; first++) {
            for (let second = first + 1; second < ids.length; second++) {
                for (const a of segments(routes[ids[first]].points).slice(
                    1,
                    -1
                )) {
                    for (const b of segments(routes[ids[second]].points).slice(
                        1,
                        -1
                    )) {
                        expect(overlap(a, b)).toBe(0);
                    }
                }
            }
        }
    });

    it('renders a rounded path ending at the destination field', () => {
        const route = arrangeRelationshipRoutes(
            [request('first', 40)],
            obstacles
        ).first;
        const path = getRoutePath(route.points);
        expect(path).toMatch(/^M 100 40/);
        expect(path).toMatch(/L 300 40$/);
    });

    it('routes tables positioned at fractional coordinates', () => {
        const routes = arrangeRelationshipRoutes(
            [
                {
                    id: 'fractional',
                    source: { x: 553.5737750901473, y: 42.2213290851388 },
                    target: { x: 358.12187795351235, y: 142.21426013465492 },
                    sourceSide: 'left',
                    targetSide: 'right',
                },
            ],
            [
                {
                    left: 553.5737750901473,
                    right: 777.5737750901473,
                    top: -20.278674729558468,
                    bottom: 155.72132527044153,
                },
                {
                    left: 134.12187795351235,
                    right: 358.12187795351235,
                    top: 79.71425250526038,
                    bottom: 319.7142525052604,
                },
            ]
        );
        expect(routes.fractional).toBeDefined();
        expect(routes.fractional.points[0].x).toBe(553.5737750901473);
        expect(routes.fractional.points.at(-1)?.x).toBe(358.12187795351235);
    });
});
