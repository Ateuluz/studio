
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Node, Edge } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const NODES_FILE_PATH = path.join(DATA_DIR, 'nodes.json');
const EDGES_FILE_PATH = path.join(DATA_DIR, 'edges.json');

async function ensureFileExistsAndReadable(filePath: string): Promise<string> {
  try {
    // Check if data directory exists. This API route should not create it.
    // It assumes data-actions.ts handles directory/file creation during save operations.
    await fs.access(DATA_DIR);
  } catch (dirError) {
    // If DATA_DIR doesn't exist, we can't read from it.
    console.warn(`Data directory ${DATA_DIR} not found for file ${filePath}. Serving empty data.`);
    return '[]'; // Return empty array string, as if file was empty or not found
  }
  
  try {
    // Try to read the file.
    await fs.access(filePath, fs.constants.R_OK); // Check read access
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array string.
      console.warn(`File ${filePath} not found. Serving empty data.`);
      return '[]';
    }
    // For other errors (e.g., permission issues), log and return empty array string.
    console.warn(`Error accessing or reading file ${filePath}:`, error);
    return '[]'; 
  }
}


export async function GET() {
  try {
    let nodes: Node[] = [];
    let edges: Edge[] = [];

    const nodesDataString = await ensureFileExistsAndReadable(NODES_FILE_PATH);
    // nodesDataString will now always be a string (either file content or '[]')
    try {
      nodes = JSON.parse(nodesDataString);
    } catch (parseError) {
      console.warn('Error parsing nodes data, serving empty nodes array for download.', parseError);
      nodes = []; // Ensure nodes is an array in case of catastrophic parse error
    }


    const edgesDataString = await ensureFileExistsAndReadable(EDGES_FILE_PATH);
    // edgesDataString will now always be a string
    try {
      edges = JSON.parse(edgesDataString);
    } catch (parseError) {
      console.warn('Error parsing edges data, serving empty edges array for download.', parseError);
      edges = []; // Ensure edges is an array
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

