import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { arrangeRelationshipLanes, getLanePath } from './relationship-routing';

const nodes: Node[] = [
    {
        id: 'a',
        type: 'table',
        position: { x: 0, y: 0 },
        measured: { width: 100, height: 100 },
        data: {},
    },
    {
        id: 'b',
        type: 'table',
        position: { x: 300, y: 0 },
        measured: { width: 100, height: 100 },
        data: {},
    },
    {
        id: 'c',
        type: 'table',
        position: { x: 150, y: -80 },
        measured: { width: 100, height: 260 },
        data: {},
    },
];

const relationship = (id: string): DBRelationship => ({
    id,
    name: id,
    sourceTableId: 'a',
    targetTableId: 'b',
    sourceFieldId: id,
    targetFieldId: id,
    sourceCardinality: 'one',
    targetCardinality: 'many',
    createdAt: 0,
});

describe('relationship routing', () => {
    it('assigns separate lanes outside all intervening tables', () => {
        const lanes = arrangeRelationshipLanes(
            [relationship('first'), relationship('second')],
            nodes
        );
        expect(Math.abs(lanes.first - lanes.second)).toBeGreaterThanOrEqual(28);
        expect(
            [lanes.first, lanes.second].every((y) => y < -98 || y > 198)
        ).toBe(true);
    });

    it('keeps relationship endpoints while using its assigned lane', () => {
        const path = getLanePath({
            sourceX: 100,
            sourceY: 40,
            targetX: 300,
            targetY: 70,
            sourceSide: 'right',
            targetSide: 'left',
            laneY: -120,
        });
        expect(path).toMatch(/^M 100 40/);
        expect(path).toContain('-120');
        expect(path).toMatch(/L 300 70$/);
    });
});
