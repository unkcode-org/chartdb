export type Point = { x: number; y: number };
export type Side = 'left' | 'right';
export type Rect = { left: number; right: number; top: number; bottom: number };

export type RouteRequest = {
    id: string;
    source: Point;
    target: Point;
    sourceSide: Side;
    targetSide: Side;
};

export type RelationshipRoute = {
    points: Point[];
    sourceSide: Side;
    targetSide: Side;
};

type Segment = { from: Point; to: Point };
type QueueItem = { state: number; cost: number };

const CLEARANCE = 12;
const BEND_COST = 24;
const CROSSING_COST = 100;
const OVERLAP_COST = 1000;

const uniqueSorted = (values: number[]) =>
    [...new Set(values)].sort((a, b) => a - b);

const crossesTable = (from: Point, to: Point, rect: Rect) => {
    if (from.y === to.y) {
        return (
            from.y > rect.top - CLEARANCE &&
            from.y < rect.bottom + CLEARANCE &&
            Math.min(from.x, to.x) < rect.right + CLEARANCE &&
            Math.max(from.x, to.x) > rect.left - CLEARANCE
        );
    }
    return (
        from.x > rect.left - CLEARANCE &&
        from.x < rect.right + CLEARANCE &&
        Math.min(from.y, to.y) < rect.bottom + CLEARANCE &&
        Math.max(from.y, to.y) > rect.top - CLEARANCE
    );
};

const sharedLength = (a: Segment, b: Segment) => {
    if (a.from.y === a.to.y && b.from.y === b.to.y && a.from.y === b.from.y) {
        return Math.max(
            0,
            Math.min(Math.max(a.from.x, a.to.x), Math.max(b.from.x, b.to.x)) -
                Math.max(Math.min(a.from.x, a.to.x), Math.min(b.from.x, b.to.x))
        );
    }
    if (a.from.x === a.to.x && b.from.x === b.to.x && a.from.x === b.from.x) {
        return Math.max(
            0,
            Math.min(Math.max(a.from.y, a.to.y), Math.max(b.from.y, b.to.y)) -
                Math.max(Math.min(a.from.y, a.to.y), Math.min(b.from.y, b.to.y))
        );
    }
    return 0;
};

const intersects = (a: Segment, b: Segment) => {
    const horizontal = a.from.y === a.to.y ? a : b.from.y === b.to.y ? b : null;
    const vertical = a.from.x === a.to.x ? a : b.from.x === b.to.x ? b : null;
    return (
        horizontal !== null &&
        vertical !== null &&
        vertical.from.x > Math.min(horizontal.from.x, horizontal.to.x) &&
        vertical.from.x < Math.max(horizontal.from.x, horizontal.to.x) &&
        horizontal.from.y > Math.min(vertical.from.y, vertical.to.y) &&
        horizontal.from.y < Math.max(vertical.from.y, vertical.to.y)
    );
};

const push = (heap: QueueItem[], item: QueueItem) => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent].cost <= item.cost) break;
        heap[index] = heap[parent];
        index = parent;
    }
    heap[index] = item;
};

const pop = (heap: QueueItem[]): QueueItem | undefined => {
    const first = heap[0];
    const last = heap.pop();
    if (!first || !last || heap.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost)
            child++;
        if (heap[child].cost >= last.cost) break;
        heap[index] = heap[child];
        index = child;
    }
    heap[index] = last;
    return first;
};

const simplify = (points: Point[]) =>
    points.filter((point, index) => {
        if (index === 0 || index === points.length - 1) return true;
        const previous = points[index - 1];
        const next = points[index + 1];
        return !(
            (previous.x === point.x && point.x === next.x) ||
            (previous.y === point.y && point.y === next.y)
        );
    });

/** Route complete orthogonal paths, avoiding tables and penalizing shared segments. */
export const arrangeRelationshipRoutes = (
    requests: RouteRequest[],
    obstacles: Rect[]
): Record<string, RelationshipRoute> => {
    const result: Record<string, RelationshipRoute> = {};
    const horizontal = new Map<number, Segment[]>();
    const vertical = new Map<number, Segment[]>();
    const ordered = [...requests].sort(
        (a, b) =>
            Math.abs(a.source.x - a.target.x) +
                Math.abs(a.source.y - a.target.y) -
                Math.abs(b.source.x - b.target.x) -
                Math.abs(b.source.y - b.target.y) || a.id.localeCompare(b.id)
    );

    for (const request of ordered) {
        const sourceStub = {
            x:
                request.source.x +
                (request.sourceSide === 'left' ? -CLEARANCE : CLEARANCE),
            y: request.source.y,
        };
        const targetStub = {
            x:
                request.target.x +
                (request.targetSide === 'left' ? -CLEARANCE : CLEARANCE),
            y: request.target.y,
        };
        const nearby = obstacles.filter(
            (rect) =>
                rect.left < Math.max(sourceStub.x, targetStub.x) + 180 &&
                rect.right > Math.min(sourceStub.x, targetStub.x) - 180 &&
                rect.top < Math.max(sourceStub.y, targetStub.y) + 180 &&
                rect.bottom > Math.min(sourceStub.y, targetStub.y) - 180
        );
        const xs = uniqueSorted([
            sourceStub.x,
            targetStub.x,
            (sourceStub.x + targetStub.x) / 2,
            ...Array.from(vertical.keys()).flatMap((x) => [x - 18, x + 18]),
            ...nearby.flatMap((rect) => [
                rect.left - CLEARANCE,
                rect.right + CLEARANCE,
                rect.left - CLEARANCE - 18,
                rect.right + CLEARANCE + 18,
            ]),
        ]);
        const ys = uniqueSorted([
            sourceStub.y,
            targetStub.y,
            (sourceStub.y + targetStub.y) / 2,
            ...Array.from(horizontal.keys()).flatMap((y) => [y - 18, y + 18]),
            ...nearby.flatMap((rect) => [
                rect.top - CLEARANCE,
                rect.bottom + CLEARANCE,
                rect.top - CLEARANCE - 18,
                rect.bottom + CLEARANCE + 18,
            ]),
        ]);
        const width = xs.length;
        const height = ys.length;
        const pointAt = (x: number, y: number): Point => ({
            x: xs[x],
            y: ys[y],
        });
        const cell = (x: number, y: number) => y * width + x;
        const startX = xs.indexOf(sourceStub.x);
        const startY = ys.indexOf(sourceStub.y);
        const endX = xs.indexOf(targetStub.x);
        const endY = ys.indexOf(targetStub.y);
        const startCell = cell(startX, startY);
        const endCell = cell(endX, endY);
        const costs = new Float64Array(width * height * 3).fill(Infinity);
        const previous = new Int32Array(costs.length).fill(-1);
        const heap: QueueItem[] = [];
        const startState = startCell * 3;
        costs[startState] = 0;
        push(heap, { state: startState, cost: 0 });
        let found = -1;

        while (heap.length > 0) {
            const current = pop(heap)!;
            if (current.cost !== costs[current.state]) continue;
            const currentCell = Math.floor(current.state / 3);
            if (currentCell === endCell) {
                found = current.state;
                break;
            }
            const x = currentCell % width;
            const y = Math.floor(currentCell / width);
            const from = pointAt(x, y);
            for (const [dx, dy, direction] of [
                [-1, 0, 1],
                [1, 0, 1],
                [0, -1, 2],
                [0, 1, 2],
            ]) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const to = pointAt(nx, ny);
                if (obstacles.some((rect) => crossesTable(from, to, rect)))
                    continue;
                const segment = { from, to };
                const length =
                    Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
                let cost = current.cost + length;
                if (current.state % 3 !== 0 && current.state % 3 !== direction)
                    cost += BEND_COST;
                const parallel =
                    from.y === to.y
                        ? horizontal.get(from.y)
                        : vertical.get(from.x);
                for (const other of parallel ?? []) {
                    cost +=
                        sharedLength(segment, other) *
                        OVERLAP_COST *
                        (from.x === to.x ? 20 : 1);
                }
                const perpendicular = from.y === to.y ? vertical : horizontal;
                for (const [coordinate, segments] of perpendicular) {
                    const minimum =
                        from.y === to.y
                            ? Math.min(from.x, to.x)
                            : Math.min(from.y, to.y);
                    const maximum =
                        from.y === to.y
                            ? Math.max(from.x, to.x)
                            : Math.max(from.y, to.y);
                    if (coordinate <= minimum || coordinate >= maximum)
                        continue;
                    for (const other of segments) {
                        if (intersects(segment, other)) cost += CROSSING_COST;
                    }
                }
                const nextState = cell(nx, ny) * 3 + direction;
                if (cost >= costs[nextState]) continue;
                costs[nextState] = cost;
                previous[nextState] = current.state;
                push(heap, { state: nextState, cost });
            }
        }

        if (found < 0) continue;
        const gridPoints: Point[] = [];
        for (let state = found; state >= 0; state = previous[state]) {
            const currentCell = Math.floor(state / 3);
            gridPoints.push(
                pointAt(currentCell % width, Math.floor(currentCell / width))
            );
        }
        gridPoints.reverse();
        const points = simplify([
            request.source,
            ...gridPoints,
            request.target,
        ]);
        result[request.id] = {
            points,
            sourceSide: request.sourceSide,
            targetSide: request.targetSide,
        };
        for (let index = 1; index < points.length; index++) {
            const segment = { from: points[index - 1], to: points[index] };
            const map = segment.from.y === segment.to.y ? horizontal : vertical;
            const coordinate =
                segment.from.y === segment.to.y
                    ? segment.from.y
                    : segment.from.x;
            map.set(coordinate, [...(map.get(coordinate) ?? []), segment]);
        }
    }
    return result;
};

export const getRoutePath = (points: Point[]): string => {
    if (points.length === 0) return '';
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
        const radius = Math.min(10, incoming / 2, outgoing / 2);
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
