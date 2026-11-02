import type { CompiledCircuit, CompiledElement, ModelSpec, PinRef, Ratings } from './types.ts';

export interface CircuitPart {
  id: string;
  label: string;
  model: ModelSpec;
  ratings?: Ratings;
  pinCount: number;
}

export interface Compiled extends CompiledCircuit {
  /** Node index for each pin, keyed by `instanceId:pinIndex`. */
  pinNodes: Map<string, number>;
  /** Element index for each part id. Parts with no model are not in the map. */
  elementIndex: Map<string, number>;
}

export const pinKey = (ref: PinRef) => `${ref.inst}:${ref.pin}`;

/** Joins pins that wires connect into nodes. Node 0 is ground. */
export function compile(parts: CircuitPart[], wires: { a: PinRef; b: PinRef }[]): Compiled {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };

  for (const part of parts) {
    for (let pin = 0; pin < part.pinCount; pin++) {
      const key = pinKey({ inst: part.id, pin });
      parent.set(key, key);
    }
  }
  for (const wire of wires) {
    const a = find(pinKey(wire.a));
    const b = find(pinKey(wire.b));
    if (a !== b) parent.set(a, b);
  }

  // Ground is the negative terminal of the first source. With no source, the first pin is ground.
  const source = parts.find((p) => p.model.type === 'battery' || p.model.type === 'acsource');
  const groundKey = source ? pinKey({ inst: source.id, pin: 1 }) : parent.keys().next().value;
  const nodeOfRoot = new Map<string, number>();
  if (groundKey !== undefined) nodeOfRoot.set(find(groundKey), 0);

  const pinNodes = new Map<string, number>();
  for (const key of parent.keys()) {
    const root = find(key);
    if (!nodeOfRoot.has(root)) nodeOfRoot.set(root, nodeOfRoot.size);
    pinNodes.set(key, nodeOfRoot.get(root)!);
  }

  const elements: CompiledElement[] = [];
  const elementIndex = new Map<string, number>();
  for (const part of parts) {
    if (part.model.type === 'none') continue;
    elementIndex.set(part.id, elements.length);
    elements.push({
      id: part.id,
      label: part.label,
      type: part.model.type,
      nodes: Array.from({ length: part.pinCount }, (_, pin) =>
        pinNodes.get(pinKey({ inst: part.id, pin }))!,
      ),
      model: part.model,
      ratings: part.ratings,
    });
  }

  return { nodeCount: Math.max(nodeOfRoot.size, 1), elements, pinNodes, elementIndex };
}
