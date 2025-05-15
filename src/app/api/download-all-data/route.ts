
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Node, Edge } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const NODES_FILE_PATH = path.join(DATA_DIR, 'nodes.json');
const EDGES_FILE_PATH = path.join(DATA_DIR, 'edges.json');

async function ensureFileExistsAndReadable(filePath: string): Promise<string | null> {
  try {
    await fs.access(DATA_DIR); // Check if data directory exists
  } catch {
     try {
        await fs.mkdir(DATA_DIR, { recursive: true }); // Create data directory if it doesn't exist
     } catch (mkdirError) {
        console.error(`Error creating data directory ${DATA_DIR}:`, mkdirError);
        return null; // Cannot proceed if data directory cannot be created/accessed
     }
  }
  
  try {
    await fs.access(filePath, fs.constants.R_OK); // Check read access
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is fine, we'll return empty data for it.
      // Try to create an empty file to avoid future ENOENT on read for this session if needed.
      try {
        await fs.writeFile(filePath, '[]', 'utf-8'); // Create empty JSON array
        return '[]';
      } catch (writeError) {
        console.warn(`Could not create placeholder file ${filePath}:`, writeError);
        return null; // Return null if creation fails
      }
    }
    console.warn(`Error accessing or reading file ${filePath}:`, error);
    return null; // For other errors (e.g., permission issues)
  }
}


export async function GET() {
  try {
    let nodes: Node[] = [];
    let edges: Edge[] = [];

    const nodesDataString = await ensureFileExistsAndReadable(NODES_FILE_PATH);
    if (nodesDataString) {
      try {
        nodes = JSON.parse(nodesDataString);
      } catch (parseError) {
        console.warn('Error parsing nodes.json, serving empty nodes array for download.', parseError);
      }
    } else {
        console.warn('Nodes file not found or unreadable for download, serving empty nodes array.');
    }


    const edgesDataString = await ensureFileExistsAndReadable(EDGES_FILE_PATH);
    if (edgesDataString) {
      try {
        edges = JSON.parse(edgesDataString);
      } catch (parseError) {
        console.warn('Error parsing edges.json, serving empty edges array for download.', parseError);
      }
    } else {
        console.warn('Edges file not found or unreadable for download, serving empty edges array.');
    }
    
    const allData = {
      nodes,
      edges,
    };

    const jsonData = JSON.stringify(allData, null, 2);

    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="node_weaver_data.json"',
      },
    });
  } catch (error) {
    console.error('Failed to serve download data:', error);
    return new NextResponse(JSON.stringify({ message: 'Error fetching data for download' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
