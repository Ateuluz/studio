
# **Node Weaver Application Documentation**

## 1. Introduction

**Purpose:** Node Weaver is a visual application designed for creating, connecting, and organizing information in the form of nodes and edges. It provides an interactive canvas where users can map out concepts, entities, and their relationships.

**Core Features Overview:**
*   **Node Creation & Management:** Users can create nodes, define their attributes (name, description, tags, type, birthday), edit them, and delete them.
*   **Edge Creation & Management:** Nodes can be linked by edges, which can also have attributes (tags with optional dates). Edges can be edited and deleted.
*   **Node Types:** Nodes can be designated as 'category' or 'entity', influencing their visual appearance and available attributes.
*   **Interactive Canvas:** A pannable and zoomable canvas displays the nodes and edges.
*   **Node Repulsion:** Nodes automatically repel each other to avoid visual overlap.
*   **Persistence:** Node and edge data is saved to the browser's `localStorage` and loaded on startup.
*   **Visual Styling:** A dark theme with specific accent colors for clarity and aesthetic appeal.

## 2. Core Concepts & Data Structures

### 2.1. Nodes
Nodes are the primary elements representing pieces of information or entities.

*   **Attributes:**
    *   `id: string` (Unique identifier, e.g., `crypto.randomUUID()`)
    *   `name: string` (Display name of the node)
    *   `description: string` (A brief description)
    *   `tags: string[]` (An array of string tags associated with the node, e.g., `["Main", "ProjectX"]`)
    *   `x: number` (World X-coordinate of the node's top-left corner)
    *   `y: number` (World Y-coordinate of the node's top-left corner)
    *   `type: 'category' | 'entity'` (Determines behavior and appearance)
    *   `birthday?: string` (Optional, YYYY-MM-DD format, applicable if `type` is 'entity')

*   **Visual Representation:**
    *   Shape: Round.
    *   Color: `hsl(var(--node-color))` (Soft Blue: `#ADD8E6` or `hsl(206, 40%, 75%)`).
    *   Size: Differentiated by `type`. 'Category' nodes are larger than 'entity' nodes.
        *   `CATEGORY_NODE_DIMENSION = 160` (world units)
        *   `ENTITY_NODE_DIMENSION = 128` (world units)
    *   Border: 'Entity' nodes have a distinct, brighter border (`hsl(var(--ring))`).
    *   Content: Displays the node's `name` and up to two of its `tags`. Font size adjusts dynamically with canvas zoom to maintain readability.

### 2.2. Edges
Edges represent relationships or connections between two nodes.

*   **Attributes:**
    *   `id: string` (Unique identifier)
    *   `sourceNodeId: string` (ID of the starting node)
    *   `targetNodeId: string` (ID of the ending node)
    *   `tags: EdgeTag[]` (An array of `EdgeTag` objects)

*   **`EdgeTag` Object Structure:**
    *   `name: string` (Name of the tag for the edge)
    *   `date?: string` (Optional, YYYY-MM-DD format, specific to this tag on this edge)

*   **Visual Representation:**
    *   Drawn as straight lines connecting the visual centers of the source and target nodes.
    *   Color: `hsl(var(--ring))` (Teal).
    *   Stroke width: Dynamically adjusted based on canvas zoom (`2 / scale`) to maintain consistent on-screen thickness.

### 2.3. World Coordinates
A conceptual 2D plane where all nodes exist. Node `x` and `y` attributes are in this coordinate system. This system is independent of the screen.

### 2.4. Viewport / Display Box
The rectangular area on the user's screen through which they view the world.
*   `containerWidth`: The current width of the display box in screen pixels.
*   `CONTAINER_HEIGHT_PX = 500`: The fixed height of the display box in screen pixels.

### 2.5. Pan & Zoom
Mechanisms allowing the user to navigate the world.
*   `scale: number`: The current zoom level. `1` is 100%. Values `<1` zoom out, `>1` zoom in.
    *   `minScale = 0.1`, `maxScale = 1.5`.
*   `offsetX: number`, `offsetY: number`: Screen pixel offsets applied to the world content to achieve panning.

## 3. Application Architecture (High-Level)

The application is built as a single-page interactive experience.
*   **State Management:** Core data (nodes, edges) and UI states (dialog visibility, interaction modes like dragging or linking, pan/zoom offsets) are managed within the main application component.
*   **Event Handling:** User interactions (mouse clicks, drags, touch events) on nodes and the canvas trigger state changes and application logic.
*   **Rendering:** The visual representation of nodes, edges, and the grid is dynamically updated based on the current state.

## 4. Key Functionalities & Algorithms

### 4.1. Node Management

#### Node Creation
*   **Trigger:** Clicking the "Create New Node" button.
*   **Dialog:** Prompts for `name`, `description`, `tags` (comma-separated string), `type` ('category' or 'entity'), and `birthday` (if 'entity').
*   **"Main" Tag Uniqueness:** If the new node is tagged "Main", this tag is removed from any other node that previously held it.
    ```typescript
    // Inside createNode function, after parsing tagsArray:
    if (tagsArray.includes("Main")) {
      currentNodesForCreation = currentNodesForCreation.map(n => {
        if (n.tags.includes("Main")) {
          return { ...n, tags: n.tags.filter(t => t !== "Main") };
        }
        return n;
      });
    }
    ```
*   **Initial Placement:**
    *   Nodes are placed within a central area of the current viewport (calculated in world coordinates).
    *   **Overlap Avoidance:** Attempts (`MAX_PLACEMENT_ATTEMPTS = 30`) are made to find a random position that doesn't overlap with existing nodes.
        ```typescript
        // Simplified logic within createNode:
        const newNodeDimension = getNodeDimension(newNodeType);
        const worldViewCenterX = (-offsetX + containerWidth / 2) / scale;
        const worldViewCenterY = (-offsetY + CONTAINER_HEIGHT_PX / 2) / scale;
        const creationAreaWorldWidth = (containerWidth / 2) / scale;
        const creationAreaWorldHeight = (CONTAINER_HEIGHT_PX / 2) / scale;

        do {
          newNodeX = worldViewCenterX - (creationAreaWorldWidth / 2) + Math.random() * creationAreaWorldWidth;
          newNodeY = worldViewCenterY - (creationAreaWorldHeight / 2) + Math.random() * creationAreaWorldHeight;

          let overlap = false;
          for (const existingNode of currentNodesForCreation) {
            const existingNodeDimension = getNodeDimension(existingNode);
            if (
              newNodeX < existingNode.x + existingNodeDimension &&
              newNodeX + newNodeDimension > existingNode.x &&
              newNodeY < existingNode.y + existingNodeDimension &&
              newNodeY + existingNodeDimension > existingNode.y
            ) {
              overlap = true;
              break;
            }
          }
          if (!overlap) placed = true;
          attempts++;
        } while (!placed && attempts < MAX_PLACEMENT_ATTEMPTS);

        if (!placed) { // Fallback if no non-overlapping spot found
          newNodeX = worldViewCenterX - newNodeDimension / 2;
          newNodeY = worldViewCenterY - newNodeDimension / 2;
        }
        ```
*   A new `Node` object is created and added to the `nodes` state.
*   Data is saved to persistence.

#### Node Editing
*   **Trigger:** A simple click/tap on a node (if not leading to a drag or press-hold completion).
*   **Dialog:** Displays current node attributes (`name`, `description`, `tags`, `birthday`). The `type` is shown but is not editable.
*   **"Main" Tag Uniqueness:** Enforced similarly to creation. If the edited node gets the "Main" tag, it's removed from others.
*   Changes are saved to state and persistence.

#### Node Deletion
*   **Trigger:** Clicking the "Delete Node" button (with `Trash2` icon) in the Edit Node dialog.
*   **Logic:**
    *   Removes the `editingNode` from the `nodes` array.
    *   Removes all edges connected to this node (where `sourceNodeId` or `targetNodeId` matches the deleted node's ID) from the `edges` array.
    *   Updates state and persists changes.

#### Node Rendering
*   `getNodeDimension(nodeOrType: Node | Node['type']): number`: Returns `CATEGORY_NODE_DIMENSION` or `ENTITY_NODE_DIMENSION`.
*   Nodes are rendered as `div` elements with absolute positioning based on their `x`, `y` world coordinates, within a transformed container.
*   Dynamic styles:
    *   `width`, `height`: Based on `getNodeDimension`.
    *   `backgroundColor`: `hsl(var(--node-color))`.
    *   `borderRadius`: `'9999px'` (for a circle).
    *   `borderColor`, `borderWidth`: Used for 'entity' nodes (`hsl(var(--ring))`, `2px`).
*   Text display:
    *   Node `name`.
    *   Up to 2 `tags`. If more, shows "+N more".
    *   Font sizes for name and tags dynamically adjust (`Math.max(minFontSize, baseFontSize * Math.min(scale, 1)) / scale`) to maintain readability relative to the node's apparent size on screen.

### 4.2. Edge Management

#### Edge Creation (Linking)
*   **Triggers:**
    1.  **Press-Hold & Drag:** User presses and holds on a source node, then drags the pointer. If released over another node, an edge is considered.
    2.  **Reposition & Drop:** User drags a node (for repositioning) and drops it directly onto another node.
*   `findExistingEdge(nodeId1: string, nodeId2: string): Edge | undefined`: Utility to check if an edge already exists between two nodes.
*   **Linking Preview Line:** During press-hold & drag, a dashed line (`linkingLinePreview`) is drawn from the source node's center to the current pointer position (in world coordinates).
*   **Dialog Logic:**
    *   If an edge already exists, the "Edit Edge" dialog opens.
    *   Otherwise, the "Create Edge" dialog opens.
    *   Dialog prompts for `tags` using a `Textarea`.
*   **Tag Input Format:** Comma-separated. Each tag can optionally have a date in parentheses: `tag one (2023-01-15), tag two, another (2023-02-20)`.
*   **Utility Functions for Tags:**
    *   `parseTagsWithDates(tagsInput: string): EdgeTag[]`: Parses the input string into an array of `EdgeTag` objects.
        ```typescript
        // Simplified regex logic:
        // const regex = /^(.*?)(?:\s*\((....-..-..)\))?$/;
        // For each comma-separated entry, match name and optional date.
        ```
    *   `formatTagsWithDates(tags: EdgeTag[]): string`: Converts an array of `EdgeTag` objects back to the string format for display in edit dialogs.
*   A new `Edge` object is created and added to the `edges` state. Data is persisted.

#### Edge Editing
*   **Trigger:** As described above (attempting to link already connected nodes).
*   **Dialog:**
    *   Displays source and target node names.
    *   `Textarea` for modifying tags (pre-filled using `formatTagsWithDates`).
    *   "Save Changes" button.
    *   "Delete Edge" button.
*   Changes (or deletion) are saved to state and persistence.

#### Edge Deletion
*   **Trigger:** "Delete Edge" button in the Edit Edge dialog.
*   Removes the `editingEdge` from the `edges` array. Updates state and persists.

#### Edge Rendering
*   Edges are SVG `<line>` elements.
*   `x1, y1`: Center of the source node (e.g., `sourceNode.x + sourceDim / 2`).
*   `x2, y2`: Center of the target node.
*   `stroke`: `hsl(var(--ring))`.
*   `strokeWidth`: `2 / scale` (adjusts with zoom for consistent on-screen appearance).
*   `opacity`: `0.6`.
*   The SVG container for edges uses `overflow="visible"` and is a direct child of the main transformed container, ensuring edges draw correctly even if parts extend beyond the initial SVG bounds before transformation.

### 4.3. User Interaction Handling
This is managed by a set of event handlers (`handleNodeInteractionStart`, `handleInteractionMove`, `handleInteractionEnd`) attached to each node.

*   **`activeInteractionNodeId: string | null`**: ID of the node currently being interacted with.
*   **`pressHoldTimer: NodeJS.Timeout | null`**: For detecting press-and-hold.
*   **`interactionStartPos: { x: number, y: number } | null`**: Screen coordinates at interaction start.
*   **`dragOffset: { x: number, y: number } | null`**: Offset between mouse and node's top-left for smooth dragging.
*   **`isDraggingForReposition: boolean`**: True if dragging for moving a node.
*   **`isLinkingModeActive: boolean`**: True if press-hold completed, and now dragging to link.
*   **`linkingSourceNodeId: string | null`**: Source node for linking.
*   **`linkingLinePreview: {x1,y1,x2,y2} | null`**: Coordinates for the temporary linking line.

#### `handleNodeInteractionStart(event, node)`
*   Sets `activeInteractionNodeId` to `node.id`.
*   Records `interactionStartPos` (screen coordinates).
*   Calculates `dragOffset` (world coordinates difference between pointer and node's top-left).
*   Resets `isDraggingForReposition`, `isLinkingModeActive`, `linkingSourceNodeId`, `linkingLinePreview`.
*   Starts `pressHoldTimer` (`PRESS_HOLD_THRESHOLD = 700`ms). If timer completes before significant drag, sets `isLinkingModeActive = true` and `linkingSourceNodeId = node.id`.

#### `handleInteractionMove(event)`
*   If no `activeInteractionNodeId` or related states, returns.
*   Calculates screen displacement (`screenDx`, `screenDy`) from `interactionStartPos`.
*   If displacement exceeds `DRAG_MOVE_THRESHOLD = 10` (pixels):
    *   Clears `pressHoldTimer` (if active).
    *   If `isLinkingModeActive`:
        *   Sets `isDraggingForReposition = false`.
        *   Updates `linkingLinePreview.x2, .y2` to current world mouse position.
    *   Else (not in linking mode, implies repositioning):
        *   Sets `isDraggingForReposition = true`.
        *   Updates `activeInteractionNodeId`'s `x, y` position based on world mouse position and `dragOffset`.

#### `handleInteractionEnd(event)`
*   Clears `pressHoldTimer`.
*   Identifies `targetNodeUnderneath` (any node other than `activeInteractionNodeId` at the release point in world coordinates).
*   **Logic branching:**
    1.  **If `linkingLinePreview` exists (was dragging in linking mode):**
        *   If `targetNodeUnderneath` exists: Open create/edit edge dialog for (`linkingSourceNodeId`, `targetNodeUnderneath.id`).
        *   Else (released on empty space): Move `linkingSourceNodeId` node to release point. Persist this node move.
    2.  **Else if `isDraggingForReposition` (was dragging for repositioning):**
        *   If `targetNodeUnderneath` exists: Open create/edit edge dialog for (`activeInteractionNodeId`, `targetNodeUnderneath.id`).
        *   Node's position (updated during move) is implicitly final. Persist all nodes.
    3.  **Else if `isLinkingModeActive` (press-hold completed, but no significant drag to draw `linkingLinePreview`):**
        *   Show `showSearchBar = true`.
    4.  **Else (simple click/tap, no drag, no press-hold completion):**
        *   Find node by `activeInteractionNodeId` and open "Edit Node" dialog.
*   Resets all interaction-related state variables (`activeInteractionNodeId` (conditionally), `interactionStartPos`, `dragOffset`, `isDraggingForReposition`, `isLinkingModeActive`, `linkingSourceNodeId`, `linkingLinePreview`).

#### Search Bar
*   A state `showSearchBar: boolean` controls its visibility.
*   Appears as a fixed overlay at the bottom when `showSearchBar` is true.
*   Currently contains a simple `Input` field. Further search/connect logic is not implemented.

### 4.4. Canvas Pan & Zoom

#### Transformations
*   A `div` with `ref={transformedContentRef}` wraps all nodes and the edges SVG.
*   CSS `transform: translate(${offsetX}px, ${offsetY}px) scale(${scale})` is applied to this `div`.
*   `transformOrigin: '0 0'`.
*   **Coordinate Conversion:**
    ```typescript
    const screenToWorld = useCallback((screenX: number, screenY: number): { x: number, y: number } => {
      if (!containerRef.current || scale === 0) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect(); // Gets screen position of the main container
      const worldX = (screenX - rect.left - offsetX) / scale;
      const worldY = (screenY - rect.top - offsetY) / scale;
      return { x: worldX, y: worldY };
    }, [offsetX, offsetY, scale]);
    ```

#### Sliders
*   Three `Slider` components control `scale`, `offsetX`, and `offsetY`.

#### Dynamic Pan Limits
*   `panXSliderLimits: { min: number, max: number }`, `panYSliderLimits`.
*   A `useEffect` hook calculates these limits:
    *   Depends on `nodes`, `scale`, `containerWidth`, `activeInteractionNodeId`, `getNodeDimension`.
    *   **Important:** If `activeInteractionNodeId` is set (user is dragging), this effect returns early to prevent limits from changing during interaction.
    *   Considers a bounding box of all nodes (or a default area if no nodes).
    *   Adds padding: `paddingXWorld = (containerWidth / 2) / scale`, `paddingYWorld = (CONTAINER_HEIGHT_PX / 2) / scale`.
    *   If content (nodes + padding) is smaller than the viewport in a dimension, the content is centered in that dimension, and the pan slider range for that dimension collapses (min equals max), effectively locking panning.
    *   `offsetX` and `offsetY` are clamped to these dynamically calculated limits in separate `useEffect` hooks to avoid dependency cycles.
        ```typescript
        // Simplified clamping logic:
        // const currentClampedOffsetX = Math.max(newPanXLimits.min, Math.min(newPanXLimits.max, offsetX));
        // if (currentClampedOffsetX !== offsetX) setOffsetX(currentClampedOffsetX);
        ```

#### Initial View Centering (on "Main" node)
*   Handled by `loadDataFromLocalStorage`.
*   If a node with the "Main" tag exists:
    1.  Calculates `deltaX = -mainNode.x`, `deltaY = -mainNode.y`.
    2.  Shifts all nodes by these deltas, placing "Main" node at world (0,0).
    3.  Viewport is centered on this world (0,0) point:
        ```typescript
        // Inside loadDataFromLocalStorage, after finding mainNode and adjusting all node positions:
        const mainNodeDimension = getNodeDimension(mainNodeAfterAdjustment.type);
        setOffsetX((containerWidth / 2) - (mainNodeDimension / 2) * scale);
        setOffsetY((CONTAINER_HEIGHT_PX / 2) - (mainNodeDimension / 2) * scale);
        ```
    *   This ensures the *visual center* of the "Main" node aligns with the viewport center.

### 4.5. Background Grid

*   **Screen-Space Grid:** The grid is rendered in an SVG element that is separate from the transformed content. This SVG is fixed to the screen and does not pan or zoom with the nodes/edges.
*   **Helper Functions:**
    *   `getGridLineWorldSeparation(scale: number)`: Determines grid line separation in *world units*.
        *   `if (scale < 0.4) return BASE_GRID_SIZE * 4;`
        *   `if (scale < 0.8) return BASE_GRID_SIZE * 2;`
        *   `return BASE_GRID_SIZE;` (where `BASE_GRID_SIZE = 50`)
    *   `calculateScreenGridLinePositions(offsetX, offsetY, scale, containerWidth, containerHeight)`:
        *   Calculates `worldSeparation = getGridLineWorldSeparation(scale)`.
        *   Calculates `screenSeparation = worldSeparation * scale`.
        *   Determines the world coordinates of the viewport's top-left: `worldViewTopLeftX = -offsetX / scale`, `worldViewTopLeftY = -offsetY / scale`.
        *   Calculates the first and last multiples of `worldSeparation` that are visible or near the viewport.
        *   Converts these world line positions to *screen coordinates* for rendering:
            *   `screenX = worldX * scale + offsetX`
            *   `screenY = worldY * scale + offsetY`
        *   Returns `{ verticalLines: number[]; horizontalLines: number[] }` containing these screen coordinates.
*   **Rendering:**
    *   A dedicated SVG (`className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"`) is used.
    *   It maps over `verticalLines` and `horizontalLines` (from `screenGridData` computed via `useMemo`).
    *   Vertical lines: `<line x1={screenX} y1={0} x2={screenX} y2={CONTAINER_HEIGHT_PX} ... />`
    *   Horizontal lines: `<line x1={0} y1={screenY} x2={containerWidth} y2={screenY} ... />`
    *   `stroke="hsl(var(--border))"`, `strokeWidth={0.5}` (fixed screen pixels), `opacity="0.3"`.

### 4.6. Node Repulsion (Physics)

*   **Purpose:** Prevent nodes from visually overlapping.
*   **`applyRepulsion(currentNodes: Node[], fixedNodeId: string | null): Node[]`**:
    *   `REPULSION_ITERATIONS = 10` (number of passes per call).
    *   `MIN_SEPARATION = 15` (world units, desired space between node edges).
    *   `REPULSION_STRENGTH = 0.5` (how strongly they push).
    *   Iterates `REPULSION_ITERATIONS` times. In each iteration:
        *   For every pair of nodes (A, B):
            *   If `fixedNodeId` is set and node A or B is the `fixedNodeId`, this pair is skipped (the fixed node neither exerts nor is affected by repulsion).
            *   Calculate distance between centers, considering node dimensions (`dimA`, `dimB`).
            *   `targetSeparation = (dimA / 2) + (dimB / 2) + MIN_SEPARATION`.
            *   If `distance < targetSeparation` (overlap or too close):
                *   Calculate `overlap = targetSeparation - distance`.
                *   `forceMagnitude = overlap * REPULSION_STRENGTH`.
                *   Move node A and node B away from each other along the line connecting their centers, each by `forceMagnitude / 2`.
*   **`useEffect` Hooks:**
    1.  One hook runs if `activeInteractionNodeId` is `null` (no node selected). It applies repulsion to all nodes.
    2.  Another hook runs if `activeInteractionNodeId` *is* set. It calls `applyRepulsion` passing the `activeInteractionNodeId` as `fixedNodeId`. This means the selected node doesn't move due to repulsion and doesn't push others, but other nodes still repel each other.
*   If repulsion results in changed positions, `setNodes` is called, and changes are persisted via `saveNodesToLocalStorage`. These updates are wrapped in `setTimeout` to defer them slightly.

### 4.7. Persistence (`localStorage`)

*   **Keys:** `NODES_KEY = 'nodeWeaverNodes'`, `EDGES_KEY = 'nodeWeaverEdges'`.
*   **`loadDataFromLocalStorage()`:**
    *   Called on component mount.
    *   Reads and parses JSON strings from `localStorage`.
    *   Includes error handling for parsing.
    *   Handles "Main" node centering logic as described in section 4.4.
    *   Updates `nodes` and `edges` state.
*   **`saveNodesToLocalStorage(currentNodes: Node[])` / `saveEdgesToLocalStorage(currentEdges: Edge[])`:**
    *   Stringifies the provided array and writes it to `localStorage`.
    *   Called after:
        *   Node/edge creation.
        *   Node/edge editing/deletion (dialog confirmation).
        *   Node repositioning (drag completion).
        *   Node position updates resulting from the repulsion algorithm.
*   **"Load Data" Button:** Manually calls `loadDataFromLocalStorage`.

## 5. UI Components (Brief Overview)

The application leverages the ShadCN UI component library, which provides pre-built, stylable React components. Key components used include:
*   `Button`
*   `Dialog` (and its sub-components like `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogTrigger`)
*   `Input`
*   `Label`
*   `RadioGroup`, `RadioGroupItem`
*   `Textarea`
*   `Slider`
*   Icons from `lucide-react` (e.g., `Plus`, `Link2`, `Trash2`, `Download`).

## 6. Styling

*   **CSS Framework:** Tailwind CSS is used for utility-first styling.
*   **Theme:** Defined in `/src/app/globals.css` using CSS HSL variables for colors.
    *   Background: Dark gray (`--background: hsl(220, 13%, 11%)` approx `#1C1F26`, originally `#333333`).
    *   Foreground (text): Light (`--foreground: hsl(0, 0%, 98%)`).
    *   Primary Accent (buttons, interactive elements): Teal (`--primary: hsl(180, 50%, 40%)` approx `#339999`, originally `#008080`).
    *   Node Color: Soft blue (`--node-color: hsl(206, 40%, 75%)` approx `#ADD8E6`).
    *   Ring/Edge Color: Brighter Teal (`--ring: hsl(180, 70%, 50%)`).
*   Rounded corners, shadows, and modern aesthetics are applied to UI elements.

    