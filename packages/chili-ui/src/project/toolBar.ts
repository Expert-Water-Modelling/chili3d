// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, I18nKeys, INode, PubSub } from "chili-core";
import { a, svg } from "../components";
import { ProjectView } from "./projectView";
import style from "./toolBar.module.css";
import { Tree } from "./tree";
import { TreeGroup } from "./tree/treeItemGroup";

export class ToolBar extends HTMLElement {
    constructor(readonly projectView: ProjectView) {
        super();
        this.className = style.panel;
        this.render();
    }

    private render() {
        const buttons = [
            { icon: "icon-folder-plus", tip: "items.tool.newBoundary", command: this.newBoundary },
            { icon: "icon-unexpand", tip: "items.tool.unexpandAll", command: this.unExpandAll },
            { icon: "icon-expand", tip: "items.tool.expandAll", command: this.expandAll },
        ];
        buttons.forEach(({ icon, tip, command }) => this.button(icon, tip as I18nKeys, command));
    }

    private button(icon: string, tip: I18nKeys, command: () => void) {
        this.append(
            a(
                { title: I18n.translate(tip) },
                svg({
                    icon,
                    className: style.svg,
                    onclick: command,
                }),
            ),
        );
    }

    private readonly newBoundary = () => {
        PubSub.default.pub("executeCommand", "create.boundary");
    };

    private readonly expandAll = () => {
        this.setExpand(true);
    };

    private readonly unExpandAll = () => {
        this.setExpand(false);
    };

    private setExpand(expand: boolean) {
        let tree = this.projectView.activeTree();
        if (!tree) return;
        let first = this.projectView.activeDocument?.rootNode.firstChild;
        if (first) this.setNodeExpand(tree, first, expand);
    }

    private setNodeExpand(tree: Tree, node: INode, expand: boolean) {
        let item = tree.treeItem(node);
        if (item instanceof TreeGroup) {
            item.isExpanded = expand;
        }
        if (INode.isLinkedListNode(node) && node.firstChild) {
            this.setNodeExpand(tree, node.firstChild, expand);
        }
        if (node.nextSibling) {
            this.setNodeExpand(tree, node.nextSibling, expand);
        }
    }
}

customElements.define("chili-toolbar", ToolBar);
