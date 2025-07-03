// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Binding, CameraType, IConverter, IView, PubSub, Result } from "chili-core";
import { ContextMenu, ContextMenuItem, div, Flyout, svg } from "../components";
import style from "./viewport.module.css";

class CameraConverter implements IConverter<CameraType> {
    constructor(readonly type: CameraType) {}

    convert(value: CameraType): Result<string, string> {
        if (value === this.type) {
            return Result.ok(style.actived);
        }
        return Result.ok("");
    }
}

export class Viewport extends HTMLElement {
    private readonly _flyout: Flyout;
    private readonly _contextMenu: ContextMenu;
    private readonly _eventCaches: [keyof HTMLElementEventMap, (e: any) => void][] = [];

    constructor(readonly view: IView) {
        super();
        this.className = style.root;
        this._flyout = new Flyout();
        this._contextMenu = new ContextMenu();
        this.render();
    }

    private render() {
        this.append(
            div(
                {
                    className: style.viewControls,
                    onpointerdown: (ev) => ev.stopPropagation(),
                    onclick: (e) => e.stopPropagation(),
                },
                this.createCameraControls(),
                this.createActionControls(),
            ),
        );
    }

    private createCameraControls() {
        return div(
            { className: style.border },
            this.createCameraControl("orthographic", "icon-orthographic"),
            this.createCameraControl("perspective", "icon-perspective"),
        );
    }

    private createActionControls() {
        return div(
            { className: style.border },
            svg({
                icon: "icon-fitcontent",
                onclick: async (e) => {
                    e.stopPropagation();
                    this.view.cameraController.fitContent();
                    this.view.update();
                },
            }),
            svg({
                icon: "icon-zoomin",
                onclick: () => {
                    this.view.cameraController.zoom(this.view.width / 2, this.view.height / 2, -5);
                    this.view.update();
                },
            }),
            svg({
                icon: "icon-zoomout",
                onclick: () => {
                    this.view.cameraController.zoom(this.view.width / 2, this.view.height / 2, 5);
                    this.view.update();
                },
            }),
        );
    }

    private createCameraControl(cameraType: CameraType, icon: string) {
        return div(
            {
                className: new Binding(
                    this.view.cameraController,
                    "cameraType",
                    new CameraConverter(cameraType),
                ),
            },
            svg({
                icon: icon,
                onclick: (e) => {
                    e.stopPropagation();
                    this.view.cameraController.cameraType = cameraType;
                    this.view.update();
                },
            }),
        );
    }

    connectedCallback() {
        this.initEvent();
        this.appendChild(this._flyout);
        this.appendChild(this._contextMenu);
    }

    disconnectedCallback() {
        this.removeEvents();
        this._flyout.remove();
        this._contextMenu.remove();
    }

    dispose() {
        this.removeEvents();
    }

    private initEvent() {
        let events: [keyof HTMLElementEventMap, (view: IView, e: any) => any][] = [
            ["pointerdown", this.pointerDown],
            ["pointermove", this.pointerMove],
            ["pointerout", this.pointerOut],
            ["pointerup", this.pointerUp],
            ["wheel", this.mouseWheel],
            ["contextmenu", this.contextMenu],
        ];
        events.forEach((v) => {
            this.addEventListenerHandler(v[0], v[1]);
        });

        // Add global click handler to hide context menu
        document.addEventListener("click", this.hideContextMenu);
    }

    private addEventListenerHandler(type: keyof HTMLElementEventMap, handler: (view: IView, e: any) => any) {
        let listener = (e: any) => {
            e.preventDefault();
            handler(this.view, e);
        };
        this.addEventListener(type, listener);
        this._eventCaches.push([type, listener]);
    }

    private removeEvents() {
        this._eventCaches.forEach((x) => {
            this.removeEventListener(x[0], x[1]);
        });
        this._eventCaches.length = 0;

        // Remove global click handler
        document.removeEventListener("click", this.hideContextMenu);
    }

    private shouldShowSelectionRectangle(event: PointerEvent): boolean {
        // Only show selection rectangle when Ctrl is pressed AND dragging
        return event.ctrlKey && event.buttons === 1;
    }

    private shouldAllowFaceSelection(event: PointerEvent): boolean {
        // Allow face selection when:
        // 1. Not showing selection rectangle (not Ctrl+drag)
        // 2. Mouse is over a selectable object (not empty space)
        const isSelectionRectangle = this.shouldShowSelectionRectangle(event);
        const isOverObject = this.view.detectVisual(event.offsetX, event.offsetY).length > 0;

        // Allow face selection when not showing selection rectangle AND over an object
        return !isSelectionRectangle && isOverObject;
    }

    private shouldAllowCommandEvents(event: PointerEvent): boolean {
        // Allow command events when:
        // 1. Not showing selection rectangle (not Ctrl+drag)
        // 2. A command is currently executing
        const isSelectionRectangle = this.shouldShowSelectionRectangle(event);
        const hasExecutingCommand = this.view.document.application.executingCommand !== undefined;

        // Allow command events when not showing selection rectangle AND a command is executing
        return !isSelectionRectangle && hasExecutingCommand;
    }

    private readonly pointerMove = (view: IView, event: PointerEvent) => {
        if (this._flyout) {
            this._flyout.style.top = event.offsetY + "px";
            this._flyout.style.left = event.offsetX + "px";
        }

        // Call eventHandler for face selection when not rotating
        if (this.shouldAllowFaceSelection(event)) {
            view.document.visual.eventHandler.pointerMove(view, event);
        }
        // Call eventHandler for commands when a command is executing
        if (this.shouldAllowCommandEvents(event)) {
            view.document.visual.eventHandler.pointerMove(view, event);
        }
        view.document.visual.viewHandler.pointerMove(view, event);
    };

    private readonly pointerDown = (view: IView, event: PointerEvent) => {
        view.document.application.activeView = view;

        // Check if clicking inside context menu before hiding it
        if (this._contextMenu.isVisible()) {
            const rect = this._contextMenu.getBoundingClientRect();
            const isInsideMenu =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;

            if (isInsideMenu) {
                console.log("[DEBUG] Click inside context menu in pointerDown, not hiding");
                return; // Don't hide menu or process other events when clicking inside menu
            }
        }

        // Hide context menu on left click (only when not clicking inside it)
        this._contextMenu.hide();

        // Call eventHandler for face selection when not rotating
        if (this.shouldAllowFaceSelection(event)) {
            view.document.visual.eventHandler.pointerDown(view, event);
        }
        // Call eventHandler for commands when a command is executing
        if (this.shouldAllowCommandEvents(event)) {
            view.document.visual.eventHandler.pointerDown(view, event);
        }
        view.document.visual.viewHandler.pointerDown(view, event);
    };

    private readonly pointerUp = (view: IView, event: PointerEvent) => {
        // Call eventHandler for face selection when not rotating
        if (this.shouldAllowFaceSelection(event)) {
            view.document.visual.eventHandler.pointerUp(view, event);
        }
        // Call eventHandler for commands when a command is executing
        if (this.shouldAllowCommandEvents(event)) {
            view.document.visual.eventHandler.pointerUp(view, event);
        }
        view.document.visual.viewHandler.pointerUp(view, event);
    };

    private readonly pointerOut = (view: IView, event: PointerEvent) => {
        // Call eventHandler for face selection when not rotating
        if (this.shouldAllowFaceSelection(event)) {
            view.document.visual.eventHandler.pointerOut?.(view, event);
        }
        // Call eventHandler for commands when a command is executing
        if (this.shouldAllowCommandEvents(event)) {
            view.document.visual.eventHandler.pointerOut?.(view, event);
        }
        view.document.visual.viewHandler.pointerOut?.(view, event);
    };

    private readonly mouseWheel = (view: IView, event: WheelEvent) => {
        view.document.visual.eventHandler.mouseWheel?.(view, event);
        view.document.visual.viewHandler.mouseWheel?.(view, event);
    };

    private readonly contextMenu = (view: IView, event: MouseEvent) => {
        console.log("[DEBUG] contextMenu event fired", event);
        event.preventDefault();

        const selectedNodes = view.document.selection.getSelectedNodes();
        console.log("[DEBUG] selectedNodes:", selectedNodes);

        // Filter for any type of shape node (ShapeNode, EditableShapeNode, etc.)
        const faceNodes = selectedNodes.filter(
            (node) =>
                node.constructor.name === "ShapeNode" ||
                node.constructor.name === "EditableShapeNode" ||
                node.constructor.name.includes("Shape"),
        );
        console.log("[DEBUG] faceNodes (selected faces):", faceNodes);

        const menuItems: ContextMenuItem[] = [];

        // Check if there are any hidden faces in the document
        let hasHiddenFaces = false;
        const checkForHiddenFaces = (node: any) => {
            // Check for any type of shape node that might be hidden
            const isShapeNode =
                node.constructor.name === "ShapeNode" ||
                node.constructor.name === "EditableShapeNode" ||
                node.constructor.name.includes("Shape");

            if (isShapeNode && !node.visible) {
                hasHiddenFaces = true;
                console.log("[DEBUG] Found hidden face:", node);
                return;
            }

            // Debug: log all shape nodes and their visibility
            if (isShapeNode) {
                console.log("[DEBUG] Shape node found:", node.constructor.name, "visible:", node.visible);
            }

            if (node.firstChild) {
                let child = node.firstChild;
                while (child) {
                    checkForHiddenFaces(child);
                    if (hasHiddenFaces) return;
                    child = child.nextSibling;
                }
            }
        };
        console.log("[DEBUG] Document root node:", view.document.rootNode);
        checkForHiddenFaces(view.document.rootNode);
        console.log("[DEBUG] hasHiddenFaces:", hasHiddenFaces);

        if (faceNodes.length > 0) {
            console.log("[DEBUG] Adding Hide option");
            menuItems.push({
                id: "hide",
                label: "command.hideFaces",
                onClick: () => {
                    console.log("[DEBUG] Hide Faces clicked, publishing executeCommand");
                    PubSub.default.pub("executeCommand", "visibility.hideFaces");
                    console.log("[DEBUG] executeCommand published");
                },
            });

            // Add Delete option when faces are selected
            console.log("[DEBUG] Adding Delete option");
            menuItems.push({
                id: "delete",
                label: "command.delete",
                onClick: () => {
                    console.log("[DEBUG] Delete Faces clicked, publishing executeCommand");
                    PubSub.default.pub("executeCommand", "modify.delete");
                    console.log("[DEBUG] executeCommand published for delete");
                },
            });
        }

        // Always show "Show All" option if there are hidden faces
        if (hasHiddenFaces) {
            console.log("[DEBUG] Adding Show All option");
            menuItems.push({
                id: "showAll",
                label: "command.showAllFaces",
                onClick: () => {
                    PubSub.default.pub("executeCommand", "visibility.showAllFaces");
                },
            });
        }

        // Only show context menu if there are items to show
        if (menuItems.length > 0) {
            console.log("[DEBUG] menuItems to show:", menuItems);
            console.log("[DEBUG] ContextMenu element:", this._contextMenu);
            console.log("[DEBUG] ContextMenu in DOM:", document.contains(this._contextMenu));
            this._contextMenu.setItems(menuItems);
            this._contextMenu.show(event.clientX, event.clientY);
        } else {
            console.log("[DEBUG] No menu items to show");
        }
    };

    private readonly hideContextMenu = (event: MouseEvent) => {
        // Only handle left-clicks, not right-clicks or context menu events
        if (event.button !== 0) {
            return;
        }

        console.log("[DEBUG] Global left-click handler triggered");
        console.log("[DEBUG] Click target:", event.target);
        console.log("[DEBUG] Context menu visible:", this._contextMenu.isVisible());

        if (this._contextMenu.isVisible()) {
            // Check if the click is inside the context menu
            const rect = this._contextMenu.getBoundingClientRect();
            const isInsideMenu =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;

            console.log("[DEBUG] Click inside context menu:", isInsideMenu);
            console.log("[DEBUG] Click coordinates:", event.clientX, event.clientY);
            console.log("[DEBUG] Menu rect:", rect);

            if (!isInsideMenu) {
                console.log("[DEBUG] Hiding context menu");
                this._contextMenu.hide();
            } else {
                console.log("[DEBUG] Click inside menu, not hiding immediately");
                // Add a small delay to allow menu item clicks to process first
                setTimeout(() => {
                    if (this._contextMenu.isVisible()) {
                        console.log("[DEBUG] Hiding context menu after delay");
                        this._contextMenu.hide();
                    }
                }, 100);
            }
        }
    };
}

customElements.define("chili-uiview", Viewport);
