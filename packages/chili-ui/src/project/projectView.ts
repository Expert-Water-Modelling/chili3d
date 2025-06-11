// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { IDocument, IView, PubSub } from "chili-core";
import { div, localize, span } from "../components";
import style from "./projectView.module.css";
import { ToolBar } from "./toolBar";
import { Tree } from "./tree";

export class ProjectView extends HTMLElement {
    private readonly _documentTreeMap = new Map<IDocument, Tree>();

    private _activeDocument: IDocument | undefined;
    get activeDocument() {
        return this._activeDocument;
    }

    private readonly panel: HTMLDivElement;

    constructor(props: { className: string }) {
        super();
        this.classList.add(style.root, props.className);
        this.panel = div({
            className: style.itemsPanel,
        });
        PubSub.default.sub("activeViewChanged", this.handleActiveViewChanged);
        PubSub.default.sub("documentClosed", this.handleDocumentClosed);

        this.render();
    }

    private render() {
        this.append(
            div(
                { className: style.headerPanel },
                span({
                    className: style.header,
                    textContent: localize("items.header"),
                }),
                new ToolBar(this),
            ),
            this.panel,
        );
        this.syncItemsPanelWithProjectJson();
    }

    activeTree() {
        if (!this._activeDocument) return undefined;
        return this._documentTreeMap.get(this._activeDocument);
    }

    private readonly handleDocumentClosed = (document: IDocument) => {
        const tree = this._documentTreeMap.get(document);
        if (tree) {
            tree.remove();
            tree.dispose();
            this._documentTreeMap.delete(document);
        }
    };

    private readonly handleActiveViewChanged = (view: IView | undefined) => {
        if (this._activeDocument === view?.document) return;

        this._documentTreeMap.get(this._activeDocument!)?.remove();
        this._activeDocument = view?.document;

        if (view) {
            let tree = this._documentTreeMap.get(view.document);
            if (!tree) {
                tree = new Tree(view.document);
                this._documentTreeMap.set(view.document, tree);
            }
            this.panel.append(tree);
        }
    };

    private syncItemsPanelWithProjectJson() {
        const projectJson = localStorage.getItem("projectJson");
        if (projectJson) {
            const data = JSON.parse(projectJson);
            const groups = data.groups || [];
            const faces = data.faces || [];

            // groups.forEach((group: any) => {
            //     const groupName = group.name;
            //     const faceIds = group.faceIds || [];
            //     const groupFaces = faces.filter((face: any) => faceIds.includes(face.id));

            //     // Create a folder in the items panel for the group
            //     console.log(`Creating folder for group: ${groupName} with faceIds: ${faceIds.join(', ')}`);
            //     // Here you would implement the logic to create the folder in the items panel
            //     // and add the faces to that folder.

            //     // Sync face names in the items panel
            //     groupFaces.forEach((face: any) => {
            //         // Update the face name in the items panel
            //         console.log(`Syncing face name: ${face.name} with ID: ${face.id}`);
            //         // Here you would implement the logic to update the face name in the items panel
            //     });
            // });
        }
    }
}

customElements.define("chili-project-view", ProjectView);
