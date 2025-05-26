// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, IDocument, INode, PubSub } from "chili-core";
import { div } from "../components";
import style from "./boundaryConditionView.module.css";

type BoundaryType = "inlet" | "outlet" | "wall" | "symmetry";

export class BoundaryConditionView extends HTMLElement {
    private readonly panel = div({ className: style.panel });
    private currentFolder: INode | null = null;
    private selectedType: BoundaryType = "wall";
    // Use the document's boundaryTypes map for persistence
    private get boundaryTypes(): Map<string, BoundaryType> {
        return ((this.currentFolder as any)?.document as any).boundaryTypes;
    }

    constructor(props: { className: string }) {
        super();
        this.classList.add(props.className, style.root);
        this.style.display = "none"; // Hide by default

        // Add panel to root
        this.append(this.panel);

        PubSub.default.sub("showBoundaryCondition", this.handleShowBoundaryCondition);
        PubSub.default.sub("selectionChanged", this.handleSelectionChanged);
    }

    private readonly handleSelectionChanged = (
        document: IDocument,
        selected: INode[],
        unselected: INode[],
    ) => {
        // If nothing is selected or the selected item is not our current folder, hide the panel
        if (selected.length === 0 || (this.currentFolder && !selected.includes(this.currentFolder))) {
            this.currentFolder = null;
            this.style.display = "none";
            this.updatePanel();
        }
    };

    private readonly handleShowBoundaryCondition = (document: IDocument, node: INode) => {
        this.currentFolder = node;
        // Load saved type if exists
        const savedType = this.boundaryTypes?.get(node.id);
        if (savedType) {
            this.selectedType = savedType;
        }
        this.style.display = "block";
        this.updatePanel();

        // Show the folder's properties
        PubSub.default.pub("showProperties", document, [node]);
    };

    private updatePanel() {
        // Clear existing content
        while (this.panel.lastElementChild) {
            this.panel.removeChild(this.panel.lastElementChild);
        }

        if (!this.currentFolder) {
            this.style.display = "none";
            return;
        }

        // Create type selection container
        const typeContainer = div({ className: style.typeContainer });

        // Create header
        const header = div({ className: style.header });
        I18n.set(header, "boundary.header");

        // Create type dropdown
        const typeSelect = document.createElement("select");
        typeSelect.className = style.select;

        // Create and append options
        const options = [
            { value: "inlet", text: "Inlet" },
            { value: "outlet", text: "Outlet" },
            { value: "wall", text: "Wall" },
            { value: "symmetry", text: "Symmetry" },
        ];

        options.forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.text;
            typeSelect.appendChild(option);
        });

        // Set the selected value after creating all options
        typeSelect.value = this.selectedType;

        typeSelect.onchange = (e) => {
            this.selectedType = (e.target as HTMLSelectElement).value as BoundaryType;
            // Save the boundary type immediately when changed
            if (this.currentFolder) {
                this.boundaryTypes?.set(this.currentFolder.id, this.selectedType);
            }
        };

        typeContainer.append(header, typeSelect);

        // Create buttons container
        const buttonContainer = div({ className: style.buttonContainer });

        // Create Save button
        const saveButton = div({ className: style.button });
        I18n.set(saveButton, "boundary.save");
        saveButton.onclick = () => this.handleSave();

        // Create Cancel button
        const cancelButton = div({ className: style.button });
        I18n.set(cancelButton, "boundary.cancel");
        cancelButton.onclick = () => this.handleCancel();

        buttonContainer.append(saveButton, cancelButton);
        this.panel.append(typeContainer, buttonContainer);
    }

    private handleSave() {
        if (this.currentFolder) {
            // Save the boundary type to the document's boundaryTypes map
            this.boundaryTypes?.set(this.currentFolder.id, this.selectedType);
            PubSub.default.pub("showToast", "toast.boundary.saved");
        }
    }

    private handleCancel() {
        this.currentFolder = null;
        this.style.display = "none";
        this.updatePanel();
    }

    disconnectedCallback() {
        PubSub.default.remove("showBoundaryCondition", this.handleShowBoundaryCondition);
        PubSub.default.remove("selectionChanged", this.handleSelectionChanged);
    }
}

customElements.define("chili-boundary-condition", BoundaryConditionView);
