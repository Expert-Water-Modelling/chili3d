// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { IEventHandler, IView, ShapeType, VisualNode, VisualState } from "chili-core";

interface MouseDownData {
    time: number;
    key: number;
}

const MIDDLE = 4;
const LEFT = 1;

export class ThreeViewHandler implements IEventHandler {
    private _lastDown: MouseDownData | undefined;
    private _clearDownId: number | undefined;
    private _offsetPoint: { x: number; y: number } | undefined;
    private _isRotating: boolean = false;
    private _isOverObject: boolean = false;
    private _rotationStartTimeout: number | undefined;
    private _hasMoved: boolean = false;
    private _lastEmptyClickTime: number = 0;
    private _lastEmptyClickX: number = 0;
    private _lastEmptyClickY: number = 0;

    canRotate: boolean = true;

    dispose() {
        this.clearTimeout();
        this.clearRotationTimeout();
        this.removeRotatingClass();
    }

    /**
     * Check if the currently executing command should block rotation
     * Only block rotation when the user is actually trying to rotate (dragging)
     * Allow initial clicks to go through to the command
     */
    private shouldBlockRotation(view: IView, isOverGeometry: boolean): boolean {
        const executingCommand = view.document.application.executingCommand;
        if (!executingCommand) return false;

        // Only block rotation when the user is actually dragging (indicating they want to rotate)
        // This allows the initial click to go through to the command
        // We'll check this in the pointerMove method when we detect actual movement
        return false;
    }

    /**
     * Check if rotation should be blocked during actual movement (dragging)
     * This prevents rotation from interfering with command operations
     */
    private shouldBlockRotationDuringDrag(view: IView): boolean {
        const executingCommand = view.document.application.executingCommand;
        if (!executingCommand) return false;

        // Block rotation when any command is executing and user is dragging
        return true;
    }

    mouseWheel(view: IView, event: WheelEvent): void {
        view.cameraController.zoom(event.offsetX, event.offsetY, event.deltaY);
        view.update();
    }

    pointerMove(view: IView, event: PointerEvent): void {
        // Check if mouse is over a selectable object
        this._isOverObject = view.detectVisual(event.offsetX, event.offsetY).length > 0;

        // Check if mouse has moved significantly (indicating a drag)
        if (event.buttons === LEFT && this._rotationStartTimeout && !this._hasMoved) {
            const movement = Math.abs(event.movementX) + Math.abs(event.movementY);
            if (movement > 2) {
                // Small threshold to detect actual movement
                this._hasMoved = true;
                this.clearRotationTimeout();
                // Start rotation immediately when movement is detected
                this._isRotating = true;
                view.cameraController.startRotate(event.offsetX, event.offsetY);
                this.addRotatingClass();
            }
        }

        // Handle ViewGizmo-style rotation (left mouse button)
        // Match ViewGizmo behavior exactly: simple left mouse drag rotation
        if (event.buttons === LEFT && this._isRotating && this.canRotate) {
            // Check if a command is currently executing - if so, stop rotation
            // Use current mouse position to determine if over geometry
            const isOverGeometry = view.detectVisual(event.offsetX, event.offsetY).length > 0;
            if (this.shouldBlockRotationDuringDrag(view)) {
                this._isRotating = false;
                this._hasMoved = false;
                this.clearRotationTimeout();
                this.removeRotatingClass();
                return;
            }

            // Use exact same rotation calculation as ViewGizmo
            if (!(event.movementX === 0 && event.movementY === 0)) {
                view.cameraController.rotate(event.movementX * 4, event.movementY * 4);
                view.update();
            }
            return;
        }

        // Handle existing middle mouse button rotation/pan
        if (event.buttons !== MIDDLE) {
            return;
        }

        // Check if a command is currently executing - if so, don't allow middle mouse rotation/pan
        // Use current mouse position to determine if over geometry
        const isOverGeometry = view.detectVisual(event.offsetX, event.offsetY).length > 0;
        if (this.shouldBlockRotationDuringDrag(view)) {
            return;
        }

        let [dx, dy] = [0, 0];
        if (this._offsetPoint) {
            dx = event.offsetX - this._offsetPoint.x;
            dy = event.offsetY - this._offsetPoint.y;
            this._offsetPoint = { x: event.offsetX, y: event.offsetY };
        }
        if (event.shiftKey && this.canRotate) {
            view.cameraController.rotate(dx, dy);
        } else if (!event.shiftKey) {
            view.cameraController.pan(dx, dy);
        }
        if (dx !== 0 && dy !== 0) this._lastDown = undefined;
        view.update();
    }

    pointerDown(view: IView, event: PointerEvent): void {
        this.clearTimeout();

        // Check if mouse is over a selectable object
        this._isOverObject = view.detectVisual(event.offsetX, event.offsetY).length > 0;

        // Handle left mouse button interactions
        if (event.buttons === LEFT) {
            // Handle clicking outside geometry (empty space)
            if (!this._isOverObject) {
                // Check for double-click on empty space
                const currentTime = Date.now();
                const timeDiff = currentTime - this._lastEmptyClickTime;
                const distance = Math.sqrt(
                    Math.pow(event.offsetX - this._lastEmptyClickX, 2) +
                        Math.pow(event.offsetY - this._lastEmptyClickY, 2),
                );

                // Double-click detection: within 300ms and within 10 pixels
                if (timeDiff < 300 && distance < 10) {
                    // Double-click on empty space - clear selection
                    view.document.selection.clearSelection();
                    view.document.visual.highlighter.clear();
                    view.update();
                    this._lastEmptyClickTime = 0; // Reset to prevent triple-click
                } else {
                    // Single click on empty space - clear highlights but maintain selection state
                    view.document.visual.highlighter.clear();

                    // Re-apply visual highlights for currently selected faces
                    const selectedNodes = view.document.selection.getSelectedNodes();
                    selectedNodes.forEach((node) => {
                        if (node instanceof VisualNode) {
                            const visual = view.document.visual.context.getVisual(node);
                            if (visual) {
                                view.document.visual.highlighter.addState(
                                    visual,
                                    VisualState.edgeSelected,
                                    ShapeType.Shape,
                                );
                            }
                        }
                    });

                    view.update();

                    // Store click info for potential double-click
                    this._lastEmptyClickTime = currentTime;
                    this._lastEmptyClickX = event.offsetX;
                    this._lastEmptyClickY = event.offsetY;
                }
            }

            // Check if a command is currently executing - if so, don't start rotation
            // Allow the initial click to go through to the command
            const isOverGeometry = view.detectVisual(event.offsetX, event.offsetY).length > 0;
            if (this.shouldBlockRotation(view, isOverGeometry)) {
                return;
            }

            // Start ViewGizmo-style rotation for left mouse button (like ViewGizmo)
            if (this.canRotate) {
                this._hasMoved = false;

                // Add a small delay before starting rotation to allow face selection
                this._rotationStartTimeout = window.setTimeout(() => {
                    if (!this._hasMoved) {
                        this._isRotating = true;
                        view.cameraController.startRotate(event.offsetX, event.offsetY);
                        this.addRotatingClass();
                    }
                    this._rotationStartTimeout = undefined;
                }, 150); // 150ms delay to distinguish between click and drag

                return;
            }
        }

        // Handle existing middle mouse button behavior
        if (this._lastDown && this._lastDown.time + 500 > Date.now() && event.buttons === MIDDLE) {
            this._lastDown = undefined;
            view.cameraController.fitContent();
            view.update();
        } else if (event.buttons === MIDDLE) {
            // Check if a command is currently executing - if so, don't start middle mouse rotation/pan
            // Allow the initial click to go through to the command
            const isOverGeometry = view.detectVisual(event.offsetX, event.offsetY).length > 0;
            if (this.shouldBlockRotation(view, isOverGeometry)) {
                return;
            }

            view.cameraController.startRotate(event.offsetX, event.offsetY);
            this._lastDown = {
                time: Date.now(),
                key: event.buttons,
            };
            this._offsetPoint = { x: event.offsetX, y: event.offsetY };
        }
    }

    private clearTimeout() {
        if (this._clearDownId) {
            clearTimeout(this._clearDownId);
            this._clearDownId = undefined;
        }
    }

    private clearRotationTimeout() {
        if (this._rotationStartTimeout) {
            clearTimeout(this._rotationStartTimeout);
            this._rotationStartTimeout = undefined;
        }
    }

    pointerOut(view: IView, event: PointerEvent): void {
        this._lastDown = undefined;
        this._isRotating = false;
        this._isOverObject = false;
        this._hasMoved = false;
        this.clearRotationTimeout();
        this.removeRotatingClass();
    }

    pointerUp(view: IView, event: PointerEvent): void {
        // Handle left mouse button rotation end
        if (event.buttons === LEFT) {
            this._isRotating = false;
            this._hasMoved = false;
            this.clearRotationTimeout();
            this.removeRotatingClass();
            return;
        }

        // Handle existing middle mouse button behavior
        if (event.buttons === MIDDLE && this._lastDown) {
            this._clearDownId = window.setTimeout(() => {
                this._lastDown = undefined;
                this._clearDownId = undefined;
            }, 500);
        }
        this._offsetPoint = undefined;
    }

    keyDown(view: IView, event: KeyboardEvent): void {}

    private addRotatingClass(): void {
        // Find the viewport element and add the rotating class
        const viewportElement = document.querySelector("chili-uiview");
        if (viewportElement) {
            viewportElement.classList.add("rotating");
        }
    }

    private removeRotatingClass(): void {
        // Find the viewport element and remove the rotating class
        // Try multiple selectors to ensure we find the right element
        const selectors = ["chili-uiview", ".root", '[class*="viewport"]'];
        let viewportElement: Element | null = null;

        for (const selector of selectors) {
            viewportElement = document.querySelector(selector);
            if (viewportElement && viewportElement.classList.contains("rotating")) {
                break;
            }
        }

        if (viewportElement) {
            viewportElement.classList.remove("rotating");
        }

        // Also try to remove from any element with the rotating class
        const rotatingElements = document.querySelectorAll(".rotating");
        rotatingElements.forEach((element) => {
            element.classList.remove("rotating");
        });
    }
}
