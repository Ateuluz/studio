"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";

interface Node {
  id: string;
  name: string;
  description: string;
}

export default function Home() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [open, setOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeDescription, setNewNodeDescription] = useState("");

  const createNode = () => {
    if (newNodeName && newNodeDescription) {
      const newNode: Node = {
        id: crypto.randomUUID(),
        name: newNodeName,
        description: newNodeDescription,
      };
      setNodes([...nodes, newNode]);
      setNewNodeName("");
      setNewNodeDescription("");
      setOpen(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 sm:p-6 md:p-8 lg:p-10">
      <h1 className="text-2xl font-bold tracking-tight mb-4">Node Weaver</h1>
      <div className="flex flex-wrap justify-center gap-4 w-full max-w-4xl">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="p-4 rounded-lg shadow-md text-foreground"
            style={{ backgroundColor: "hsl(var(--node-color))" }}
          >
            <h2 className="text-lg font-semibold">{node.name}</h2>
            <p className="text-sm">{node.description}</p>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="mt-6 bg-primary text-primary-foreground hover:bg-primary/80">
            <Plus className="mr-2 h-4 w-4" />
            Create Node
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] bg-background text-foreground">
          <DialogTitle>Add New Node</DialogTitle>
          <DialogDescription>Define attributes for the new node.</DialogDescription>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Node Name"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Node Description"
                value={newNodeDescription}
                onChange={(e) => setNewNodeDescription(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" onClick={createNode} className="bg-primary text-primary-foreground hover:bg-primary/80">
            Create
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

