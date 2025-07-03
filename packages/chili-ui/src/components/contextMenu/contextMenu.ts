// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18nKeys } from "chili-core";
import { div, label, localize } from "../index";
import style from "./contextMenu.module.css";

export interface ContextMenuItem {
    id: string;
    label: I18nKeys;
    icon?: string;
    enabled?: boolean;
    onClick: () => void;
}

export class ContextMenu extends HTMLElement {
    private items: ContextMenuItem[] = [];

    constructor() {
        super();
        this.className = style.root;
    }

    setItems(items: ContextMenuItem[]) {
        console.log("[DEBUG] ContextMenu.setItems called with:", items);
        this.items = items;
        this.render();
        console.log("[DEBUG] ContextMenu.render completed, innerHTML length:", this.innerHTML.length);
    }

    private render() {
        this.innerHTML = "";

        this.items.forEach((item) => {
            const menuItem = div(
                {
                    className: style.menuItem,
                    onclick: (e) => {
                        console.log("[DEBUG] ContextMenu item clicked:", item.id);
                        e.stopPropagation();
                        if (item.enabled !== false) {
                            console.log("[DEBUG] ContextMenu calling onClick for:", item.id);
                            item.onClick();
                            this.hide();
                        }
                    },
                },
                label({
                    textContent: localize(item.label),
                    className: style.menuItemLabel,
                }),
            );

            if (item.enabled === false) {
                menuItem.classList.add(style.disabled);
            }

            this.appendChild(menuItem);
        });
    }

    show(x: number, y: number) {
        console.log("[DEBUG] ContextMenu.show called with:", x, y);
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
        this.style.display = "block";
        console.log("[DEBUG] ContextMenu display style set to:", this.style.display);
        console.log("[DEBUG] ContextMenu position set to:", this.style.left, this.style.top);
    }

    hide() {
        this.style.display = "none";
    }

    isVisible(): boolean {
        return this.style.display !== "none";
    }
}

customElements.define("chili-context-menu", ContextMenu);
