
'use server';

import fs from 'fs/promises';
import path from 'path';
import type { Node, Edge } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const NODES_FILE_PATH = path.join(DATA_DIR, 'nodes.json');
const EDGES_FILE_PATH = path.join(DATA_DIR, 'edges.json');

async function ensureDataDirectoryExists() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    // If directory doesn't exist, create it
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

export async function loadNodesFromFile(): Promise<Node[]> {
  await ensureDataDirectoryExists();
  try {
    const data = await fs.readFile(NODES_FILE_PATH, 'utf-8');
    return JSON.parse(data) as Node[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array (normal for first run)
      return [];
    }
    // For other errors, log and return empty array
    console.warn('Error loading nodes file, returning empty array:', error);
    return [];
  }
}

export async function saveNodesToFile(nodes: Node[]): Promise<void> {
  await ensureDataDirectoryExists();
  try {
    await fs.writeFile(NODES_FILE_PATH, JSON.stringify(nodes, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save nodes:', error);
    // Depending on desired behavior, you might want to throw the error
    // throw error; 
  }
}

export async function loadEdgesFromFile(): Promise<Edge[]> {
  await ensureDataDirectoryExists();
  try {
    const data = await fs.readFile(EDGES_FILE_PATH, 'utf-8');
    return JSON.parse(data) as Edge[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.warn('Error loading edges file, returning empty array:', error);
    return [];
  }
}

export async function saveEdgesToFile(edges: Edge[]): Promise<void> {
  await ensureDataDirectoryExists();
  try {
    await fs.writeFile(EDGES_FILE_PATH, JSON.stringify(edges, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save edges:', error);
    // throw error;
  }
}
