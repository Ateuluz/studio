
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Settings } from "lucide-react";

interface Node {
  id: string;
  name: string;
  description: string;
  tags: string[];
  x: number;
  y: number;
}

const NODE_WIDTH = 144; // w-36
const NODE_HEIGHT = 144; // h-36
const CONTAINER_MAX_WIDTH_PX = 768; // Corresponds to max-w-4xl, approx
const CONTAINER_HEIGHT_PX = 500;

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  
  // Create Node Dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");
  const [newNodeTags, setNewNodeTags] = useState("");

  // Edit Node Dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeDescription, setEditNodeDescription] = useState("");
  const [editNodeTags, setEditNodeTags] = useState("");

  const createNode = () => {
    if (newNodeName) { // Description and tags can be optional
      const tagsArray = newNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      const newNode: Node = {
        id: crypto.randomUUID(),
        name: newNodeName,
        description: newNodeDescription,
        tags: tagsArray,
        x: Math.floor(Math.random() * (CONTAINER_MAX_WIDTH_PX - NODE_WIDTH)),
        y: Math.floor(Math.random() * (CONTAINER_HEIGHT_PX - NODE_HEIGHT)),
      };
      setNodes([...nodes, newNode]);
      setNewNodeName("");
      setNewNodeDescription("");
      setNewNodeTags("");
      setIsCreateDialogOpen(false);
    }
  };

  const handleNodeClick = (node: Node) => {
    setEditingNode(node);
    setEditNodeName(node.name);
    setEditNodeDescription(node.description);
    setEditNodeTags(node.tags.join(', '));
    setIsEditDialogOpen(true);
  };

  const saveNodeChanges = () => {
    if (editingNode && editNodeName) {
      const tagsArray = editNodeTags.split(',').map(tag => tag.trim()).filter(tag => tag);
      setNodes(nodes.map(n => 
        n.id === editingNode.id 
        ? { ...n, name: editNodeName, description: editNodeDescription, tags: tagsArray } 
        : n
      ));
      setEditingNode(null);
      setIsEditDialogOpen(false);
    }
  };

  // Effect to prevent hydration errors for random node placement
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);


  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight mb-6 text-center">Node Weaver</h1>
      
      <div 
        className="relative w-full max-w-4xl border rounded-lg shadow-inner bg-card"
        style={{ height: `${CONTAINER_HEIGHT_PX}px` }}
      >
        {isClient && nodes.map((node) => (
          <div
            key={node.id}
            className="absolute w-36 h-36 p-3 rounded-full flex flex-col items-center justify-center text-center cursor-pointer shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-105"
            style={{ 
              backgroundColor: "hsl(var(--node-color))",
              left: `${node.x}px`,
              top: `${node.y}px`,
              color: "hsl(var(--card-foreground))", // Ensuring good contrast on node
            }}
            onClick={() => handleNodeClick(node)}
            title={`Click to edit ${node.name}`}
          >
            <h2 className="text-md font-semibold truncate w-full">{node.name}</h2>
            {node.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap justify-center gap-1">
                {node.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-xs bg-black/20 text-white px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {node.tags.length > 2 && (
              <span className="text-xs mt-1 text-gray-600">+{node.tags.length - 2} more</span>
            )}
          </div>
        ))}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogTrigger asChild>
          <Button className="mt-8 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg text-lg px-6 py-3 rounded-lg">
            <Plus className="mr-2 h-5 w-5" />
            Create New Node
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Add New Node</DialogTitle>
            <DialogDescription>Define attributes for the new node. Click create when you're done.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-6">
            <div className="grid gap-3">
              <Label htmlFor="create-name" className="text-md">Name</Label>
              <Input
                id="create-name"
                placeholder="Node Name (e.g., Project Alpha)"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="text-md p-3"
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="create-description" className="text-md">Description</Label>
              <Input
                id="create-description"
                placeholder="Brief description (optional)"
                value={newNodeDescription}
                onChange={(e) => setNewNodeDescription(e.target.value)}
                className="text-md p-3"
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="create-tags" className="text-md">Tags</Label>
              <Input
                id="create-tags"
                placeholder="tag1, tag2, anothertag (comma-separated, optional)"
                value={newNodeTags}
                onChange={(e) => setNewNodeTags(e.target.value)}
                className="text-md p-3"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-md px-5 py-2.5">Cancel</Button>
            </DialogClose>
            <Button type="submit" onClick={createNode} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">
              Create Node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingNode && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[480px] bg-background text-foreground border-border shadow-2xl rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">Edit Node: {editingNode.name}</DialogTitle>
              <DialogDescription>Modify the attributes of this node. Click save when you're done.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-6">
              <div className="grid gap-3">
                <Label htmlFor="edit-name" className="text-md">Name</Label>
                <Input
                  id="edit-name"
                  value={editNodeName}
                  onChange={(e) => setEditNodeName(e.target.value)}
                  className="text-md p-3"
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="edit-description" className="text-md">Description</Label>
                <Input
                  id="edit-description"
                  value={editNodeDescription}
                  onChange={(e) => setEditNodeDescription(e.target.value)}
                  className="text-md p-3"
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="edit-tags" className="text-md">Tags</Label>
                <Input
                  id="edit-tags"
                  value={editNodeTags}
                  onChange={(e) => setEditNodeTags(e.target.value)}
                  placeholder="tag1, tag2, anothertag (comma-separated)"
                  className="text-md p-3"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                 <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="text-md px-5 py-2.5">Cancel</Button>
              </DialogClose>
              <Button type="submit" onClick={saveNodeChanges} className="bg-primary text-primary-foreground hover:bg-primary/90 text-md px-5 py-2.5">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
