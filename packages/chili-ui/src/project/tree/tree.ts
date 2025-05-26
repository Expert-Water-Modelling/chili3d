// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    IDocument,
    INode,
    INodeChangedObserver,
    INodeLinkedList,
    NodeRecord,
    PubSub,
    ShapeNode,
    ShapeType,
    Transaction,
    VisualNode,
    VisualState,
} from "chili-core";
import { ThreeMeshObject } from "chili-three/src/threeVisualObject";
import { NodeSelectionHandler, ShapeSelectionHandler } from "chili-vis";
import style from "./tree.module.css";
import { TreeItem } from "./treeItem";
import { TreeGroup } from "./treeItemGroup";
import { TreeModel } from "./treeModel";

export class Tree extends HTMLElement implements INodeChangedObserver {
    private readonly nodeMap = new Map<INode, TreeItem>();
    private lastClicked: INode | undefined;
    private readonly selectedNodes: Set<INode> = new Set();
    private dragging: INode[] | undefined;
    private isHandlingSelection = false;

    constructor(private document: IDocument) {
        super();
        this.className = style.panel;
        this.initializeTree(document);
    }

    private initializeTree(document: IDocument) {
        this.addAllNodes(document, this, document.rootNode);
        this.addEvents(this);
    }

    connectedCallback() {
        this.document.addNodeObserver(this);
        PubSub.default.sub("selectionChanged", this.handleSelectionChanged);
    }

    disconnectedCallback() {
        this.document.removeNodeObserver(this);
        PubSub.default.remove("selectionChanged", this.handleSelectionChanged);
    }

    treeItem(node: INode): TreeItem | undefined {
        return this.nodeMap.get(node);
    }

    dispose(): void {
        this.lastClicked = undefined;
        this.dragging = undefined;
        this.nodeMap.forEach((x) => x.dispose());
        this.nodeMap.clear();
        this.selectedNodes.clear();
        this.removeEvents(this);
        this.document.removeNodeObserver(this);
        PubSub.default.remove("selectionChanged", this.handleSelectionChanged);
        this.document = null as any;
    }

    handleNodeChanged(records: NodeRecord[]) {
        this.ensureHasHTML(records);
        records.forEach((record) => {
            const ele = this.nodeMap.get(record.node);
            ele?.remove();
            if (!ele || !record.newParent) return;

            let parent = this.nodeMap.get(record.newParent) || this.createAndMapParent(record.newParent);
            if (parent instanceof TreeGroup) {
                const pre = record.newPrevious ? this.nodeMap.get(record.newPrevious) : null;
                parent.insertAfter(ele, pre ?? null);
            }
        });
    }

    private createAndMapParent(newParent: INode) {
        const parent = this.createHTMLElement(this.document, newParent);
        this.nodeMap.set(newParent, parent);
        return parent;
    }

    private readonly handleSelectionChanged = (
        document: IDocument,
        selected: INode[],
        unselected: INode[],
    ) => {
        if (this.isHandlingSelection) return;
        this.isHandlingSelection = true;

        try {
            // Handle folder selection/deselection
            unselected.forEach((x) => {
                this.nodeMap.get(x)?.removeSelectedStyle(style.selected);
                this.selectedNodes.delete(x);
            });

            selected.forEach((model) => {
                this.selectedNodes.add(model);
                this.nodeMap.get(model)?.addSelectedStyle(style.selected);
            });

            // Handle faces in folders
            const facesToSelect: INode[] = [];
            const facesToUnselect: INode[] = [];

            // Collect faces to select/unselect
            unselected.forEach((x) => {
                if (INode.isLinkedListNode(x)) {
                    let child = (x as INodeLinkedList).firstChild;
                    while (child) {
                        if (child instanceof ShapeNode && child.shape.isOk) {
                            facesToUnselect.push(child);
                        }
                        child = child.nextSibling;
                    }
                }
            });

            selected.forEach((model) => {
                if (INode.isLinkedListNode(model)) {
                    let child = (model as INodeLinkedList).firstChild;
                    while (child) {
                        if (child instanceof ShapeNode && child.shape.isOk) {
                            facesToSelect.push(child);
                        }
                        child = child.nextSibling;
                    }
                }
            });

            // Apply face selection changes
            if (facesToUnselect.length > 0) {
                this.document.selection.setSelection([], true);
            }
            if (facesToSelect.length > 0) {
                this.document.selection.setSelection(facesToSelect, true);
            }

            this.setLastClickItem(undefined);
            this.scrollToNode(selected);
        } finally {
            this.isHandlingSelection = false;
        }
    };

    private resetFolderFaceColors(folder: INode) {
        if (!INode.isLinkedListNode(folder)) return;

        let child = (folder as INodeLinkedList).firstChild;
        while (child) {
            if (child instanceof ShapeNode && child.shape.isOk) {
                // Reset to original material
                const visualObject = this.document.visual.context.getVisual(child);
                if (visualObject instanceof ThreeMeshObject) {
                    // Remove the face from the selection state
                    this.document.visual.highlighter.removeState(
                        visualObject,
                        VisualState.edgeHighlight,
                        ShapeType.Shape,
                    );
                }
            }
            child = child.nextSibling;
        }
    }

    private setFolderFaceColors(folder: INode) {
        if (!INode.isLinkedListNode(folder)) return;

        let child = (folder as INodeLinkedList).firstChild;
        while (child) {
            if (child instanceof ShapeNode && child.shape.isOk) {
                // Set selected folder material
                const visualObject = this.document.visual.context.getVisual(child);
                if (visualObject instanceof ThreeMeshObject) {
                    // Add the face to the selection state with edge highlight
                    this.document.visual.highlighter.addState(
                        visualObject,
                        VisualState.edgeHighlight,
                        ShapeType.Shape,
                    );
                }
            }
            child = child.nextSibling;
        }
    }

    private ensureHasHTML(records: NodeRecord[]) {
        records.forEach((record) => {
            if (!this.nodeMap.has(record.node)) {
                this.nodeMap.set(record.node, this.createHTMLElement(this.document, record.node));
            }
        });
    }

    private scrollToNode(selected: INode[]) {
        const node = selected.at(0);
        if (node) {
            this.expandParents(node);
            this.nodeMap.get(node)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    private expandParents(node: INode) {
        let parent = node.parent;
        while (parent) {
            const group = this.nodeMap.get(parent) as TreeGroup;
            if (group && !group.isExpanded) {
                group.isExpanded = true;
            }
            parent = parent.parent;
        }
    }

    private addAllNodes(document: IDocument, parent: HTMLElement, node: INode) {
        const element = this.createHTMLElement(document, node);
        this.nodeMap.set(node, element);
        parent.appendChild(element);

        const firstChild = (node as INodeLinkedList).firstChild;
        if (firstChild) this.addAllNodes(document, element, firstChild);
        if (node.nextSibling) this.addAllNodes(document, parent, node.nextSibling);
    }

    private createHTMLElement(document: IDocument, node: INode): TreeItem {
        let result: TreeItem;
        if (INode.isLinkedListNode(node)) result = new TreeGroup(document, node);
        else if (node instanceof VisualNode) result = new TreeModel(document, node);
        else throw new Error("unknown node");
        return result;
    }

    private addEvents(item: HTMLElement) {
        item.addEventListener("dragstart", this.onDragStart);
        item.addEventListener("dragover", this.onDragOver);
        item.addEventListener("dragleave", this.onDragLeave);
        item.addEventListener("drop", this.onDrop);
        item.addEventListener("click", this.onClick);
    }

    private removeEvents(item: HTMLElement) {
        item.removeEventListener("dragstart", this.onDragStart);
        item.removeEventListener("dragover", this.onDragOver);
        item.removeEventListener("dragleave", this.onDragLeave);
        item.removeEventListener("drop", this.onDrop);
        item.removeEventListener("click", this.onClick);
    }

    private getTreeItem(item: HTMLElement | null): TreeItem | undefined {
        if (item === null) return undefined;
        if (item instanceof TreeItem) return item;
        return this.getTreeItem(item.parentElement);
    }

    private readonly onClick = (event: MouseEvent) => {
        if (!this.canSelect()) return;

        const item = this.getTreeItem(event.target as HTMLElement)?.node;
        if (!item) return;
        event.stopPropagation();

        if (event.shiftKey) {
            this.handleShiftClick(item);
        } else {
            this.document.selection.setSelection([item], event.ctrlKey);
        }

        this.setLastClickItem(item);

        // Check if the clicked item is a folder with faces
        if (INode.isLinkedListNode(item)) {
            const hasFaces = this.checkFolderForFaces(item);
            if (hasFaces) {
                PubSub.default.pub("showBoundaryCondition", this.document, item);
            }
        }
    };

    private checkFolderForFaces(folder: INode): boolean {
        let hasFaces = false;
        if (!INode.isLinkedListNode(folder)) return false;

        let child = (folder as INodeLinkedList).firstChild;

        while (child) {
            if (child instanceof ShapeNode && child.shape.isOk) {
                hasFaces = true;
                break;
            }
            child = child.nextSibling;
        }

        return hasFaces;
    }

    private handleShiftClick(item: INode) {
        if (this.lastClicked) {
            const nodes = INode.getNodesBetween(this.lastClicked, item);
            this.document.selection.setSelection(nodes, false);
        }
    }

    private readonly onDragLeave = (event: DragEvent) => {
        if (!this.canDrop(event)) return;
    };

    private readonly onDragOver = (event: DragEvent) => {
        if (!this.canDrop(event)) {
            return;
        }
        event.preventDefault();
        event.dataTransfer!.dropEffect = "move";
    };

    private canSelect() {
        if (this.document.visual.eventHandler instanceof NodeSelectionHandler) {
            return true;
        }

        if (this.document.visual.eventHandler instanceof ShapeSelectionHandler) {
            return this.document.visual.eventHandler.shapeType === ShapeType.Shape;
        }

        return false;
    }

    private setLastClickItem(item: INode | undefined) {
        if (this.lastClicked !== undefined) {
            this.nodeMap.get(this.lastClicked)?.removeSelectedStyle(style.current);
        }
        this.lastClicked = item;
        if (item !== undefined) {
            this.nodeMap.get(item)?.addSelectedStyle(style.current);
            this.document.currentNode = INode.isLinkedListNode(item) ? item : item.parent;
        }
    }

    private canDrop(event: DragEvent) {
        let node = this.getTreeItem(event.target as HTMLElement)?.node;
        if (node === undefined) return false;
        if (this.dragging?.includes(node)) return false;
        let parent = node.parent;
        while (parent !== undefined) {
            if (this.dragging?.includes(parent)) return false;
            parent = parent.parent;
        }
        return true;
    }

    protected onDrop = (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();

        let node = this.getTreeItem(event.target as HTMLElement)?.node;
        if (node === undefined) return;
        Transaction.execute(this.document, "move node", () => {
            let isLinkList = INode.isLinkedListNode(node);
            let newParent = isLinkList ? (node as INodeLinkedList) : node.parent;
            let target = isLinkList ? undefined : node;
            this.dragging?.forEach((x) => {
                x.parent?.move(x, newParent!, target);
            });
            this.dragging = undefined;
        });
    };

    private readonly onDragStart = (event: DragEvent) => {
        event.stopPropagation();
        const item = this.getTreeItem(event.target as HTMLElement)?.node;
        this.dragging = INode.findTopLevelNodes(this.selectedNodes);
        if (item && !INode.containsDescendant(this.selectedNodes, item)) {
            this.dragging.push(item);
        }
    };
}

customElements.define("ui-tree", Tree);
