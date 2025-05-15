
export interface EdgeTag {
  name: string;
  date?: string;
}

export interface Node {
  id: string;
  name: string;
  description: string;
  tags: string[];
  x: number;
  y: number;
  type: 'category' | 'entity';
  birthday?: string;
}

export interface Edge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  tags: EdgeTag[];
}
