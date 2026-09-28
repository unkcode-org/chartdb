import type { Node } from '@xyflow/react';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { calcTableHeight } from '@/lib/domain/db-table';
import type { TableNodeType } from '../table-node/table-node';

/** Assign a separate, table-free horizontal lane to each visible relationship. */
export const arrangeRelationshipLanes = (
    relationships: DBRelationship[],
    nodes: Node[]
): Record<string, number> => {
    const tables = new Map(
        nodes
            .filter((node) => node.type === 'table' && !node.hidden)
            .map((node) => [
                node.id,
                {
                    left: node.position.x,
                    right:
                        node.position.x +
                        (node.measured?.width ?? node.width ?? 224),
                    top: node.position.y,
                    bottom:
                        node.position.y +
                        (node.measured?.height ??
                            calcTableHeight(
                                (node as TableNodeType).data.table
                            )),
                },
            ])
    );
    const rects = [...tables.values()];
    const occupied: { y: number; left: number; right: number }[] = [];
    const lanes: Record<string, number> = {};

    const ordered = relationships
        .filter(
            (relationship) =>
                tables.has(relationship.sourceTableId) &&
                tables.has(relationship.targetTableId)
        )
        .map((relationship) => {
            const source = tables.get(relationship.sourceTableId)!;
            const target = tables.get(relationship.targetTableId)!;
            return {
                relationship,
                left: Math.min(source.left, target.left) - 32,
                right: Math.max(source.right, target.right) + 32,
                ideal:
                    (source.top + source.bottom + target.top + target.bottom) /
                    4,
            };
        })
        .sort(
            (a, b) =>
                a.ideal - b.ideal ||
                a.relationship.id.localeCompare(b.relationship.id)
        );

    for (const item of ordered) {
        // Search outward from the natural midpoint. A lane crossing any table
        // or another lane is skipped, so parallel runs remain distinguishable.
        for (let step = 0; step < 1000; step++) {
            const offset =
                step === 0 ? 0 : Math.ceil(step / 2) * 28 * (step % 2 ? -1 : 1);
            const y = Math.round(item.ideal / 28) * 28 + offset;
            if (
                occupied.some(
                    (other) =>
                        other.left < item.right &&
                        other.right > item.left &&
                        Math.abs(other.y - y) < 28
                )
            )
                continue;
            if (
                rects.some(
                    (rect) =>
                        rect.left < item.right &&
                        rect.right > item.left &&
                        y > rect.top - 18 &&
                        y < rect.bottom + 18
                )
            )
                continue;
            lanes[item.relationship.id] = y;
            occupied.push({ y, left: item.left, right: item.right });
            break;
        }
    }

    return lanes;
};

export const getLanePath = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceSide,
    targetSide,
    laneY,
}: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourceSide: 'left' | 'right';
    targetSide: 'left' | 'right';
    laneY: number;
}): string => {
    const sourceStubX = sourceX + (sourceSide === 'left' ? -24 : 24);
    const targetStubX = targetX + (targetSide === 'left' ? -24 : 24);
    const points = [
        { x: sourceX, y: sourceY },
        { x: sourceStubX, y: sourceY },
        { x: sourceStubX, y: laneY },
        { x: targetStubX, y: laneY },
        { x: targetStubX, y: targetY },
        { x: targetX, y: targetY },
    ].filter(
        (point, index, all) =>
            index === 0 ||
            point.x !== all[index - 1].x ||
            point.y !== all[index - 1].y
    );

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const incoming = Math.hypot(
            current.x - previous.x,
            current.y - previous.y
        );
        const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
        const radius = Math.min(12, incoming / 2, outgoing / 2);
        if (!radius || previous.x === next.x || previous.y === next.y) {
            path += ` L ${current.x} ${current.y}`;
            continue;
        }
        const before = {
            x: current.x + ((previous.x - current.x) / incoming) * radius,
            y: current.y + ((previous.y - current.y) / incoming) * radius,
        };
        const after = {
            x: current.x + ((next.x - current.x) / outgoing) * radius,
            y: current.y + ((next.y - current.y) / outgoing) * radius,
        };
        path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
    }
    const last = points[points.length - 1];
    return `${path} L ${last.x} ${last.y}`;
};
