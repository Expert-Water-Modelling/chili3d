// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getProjectNameFromUrl } from "chili";
import {
    Button,
    CommandKeys,
    I18nKeys,
    IApplication,
    IWindow,
    PubSub,
    RibbonTab,
    debounce,
} from "chili-core";
import { Dialog } from "./dialog";
import { Editor } from "./editor";
import { Home } from "./home";
import { Permanent } from "./permanent";
import { Toast } from "./toast";

// Get the API base URL from environment variable
const API_BASE_URL = process.env["API_BASE_URL"] || "http://localhost:8000";

document.oncontextmenu = (e) => e.preventDefault();
document.body.addEventListener("scroll", (e) => {
    document.body.scrollTop = 0;
});

export class MainWindow implements IWindow {
    private _inited: boolean = false;
    private _home?: Home;
    private _editor?: Editor;
    private static readonly DOC_INIT_KEY = "chili3d_document_initialized";

    constructor(readonly tabs: RibbonTab[]) {
        this.setTheme("light");
    }

    async init(app: IApplication) {
        if (this._inited) {
            throw new Error("MainWindow is already inited");
        }
        this._inited = true;

        // Initialize UI components first
        this._initHome(app);
        this._initEditor(app);
        this._initSubs(app);

        // Get the project name and IDs from URL
        const projectName = getProjectNameFromUrl();
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get("id");
        const userId = urlParams.get("user_id");
        console.log("Initializing with project name:", projectName);

        // Create a new document
        console.log("Creating new document with name:", projectName);
        const document = await app.newDocument(projectName);
        if (!document) {
            throw new Error("Failed to create default document");
        }

        // Switch to document view first to ensure proper initialization
        PubSub.default.pub("displayHome", false);

        // If we have project and user IDs, try to load the STEP file
        if (projectId && userId) {
            try {
                // Download the STEP file
                const response = await fetch(
                    `${API_BASE_URL}/download_project_step_file/${userId}/${projectId}`,
                    {
                        headers: {
                            accept: "application/json",
                        },
                    },
                );
                if (!response.ok) {
                    throw new Error(`Failed to download STEP file: ${response.statusText}`);
                }

                // Convert the response to ArrayBuffer
                const stepData = await response.arrayBuffer();
                const stepArray = new Uint8Array(stepData);

                // Import the STEP file into the document
                const result = document.application.shapeFactory.converter.convertFromSTEP(
                    document,
                    stepArray,
                );
                if (!result.isOk) {
                    throw new Error("Failed to convert STEP file");
                }

                // Add the imported nodes to the document
                const importedNode = result.value;
                document.addNode(importedNode);

                // Ensure the view is properly initialized and updated
                if (app.activeView) {
                    // Update the visual representation
                    document.visual.update();

                    // Fit the view to show all content
                    app.activeView.cameraController.fitContent();

                    // Force a redraw
                    app.activeView.update();
                }

                console.log("STEP file loaded successfully");

                // Save the document after STEP file is loaded
                try {
                    // Save to API if we have project and user IDs
                    if (projectId && userId) {
                        const data = document.serialize();
                        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                        const file = new File([blob], `${document.name}.cd`, { type: "application/json" });
                        const formData = new FormData();
                        formData.append("file", file);

                        await fetch(`${API_BASE_URL}/upload_project_files/${userId}/${projectId}`, {
                            method: "POST",
                            body: formData,
                            headers: {
                                accept: "application/json",
                                "Cache-Control": "no-cache, no-store, must-revalidate",
                                Pragma: "no-cache",
                                Expires: "0",
                            },
                        });
                        console.log("Document saved to API successfully");
                    }
                } catch (error) {
                    console.error("Error saving document:", error);
                }
            } catch (error) {
                console.error("Error loading STEP file:", error);
                // Continue even if STEP file loading fails
            }
        }

        // Ensure the view is properly initialized
        if (app.activeView) {
            app.activeView.update();
            app.activeView.cameraController.fitContent();
        }

        // Override the document's close method to prevent save prompt
        const originalClose = document.close;
        document.close = async function () {
            // Call the original close method without the save prompt
            let views = this.application.views.filter((x) => x.document === this);
            this.application.views.remove(...views);
            this.application.activeView = this.application.views.at(0);
            this.application.documents.delete(this);
            PubSub.default.pub("documentClosed", this);
            this.dispose();
        };
    }

    private _initSubs(app: IApplication) {
        const displayHome = debounce(this.displayHome, 100);
        PubSub.default.sub("showToast", Toast.info);
        PubSub.default.sub("displayError", Toast.error);
        PubSub.default.sub("showDialog", Dialog.show);
        PubSub.default.sub("showPermanent", Permanent.show);
        PubSub.default.sub("activeViewChanged", (view) => displayHome(app, view === undefined));
        PubSub.default.sub("displayHome", (show) => displayHome(app, show));
    }

    private readonly displayHome = (app: IApplication, displayHome: boolean) => {
        if (this._home) {
            this._home.remove();
            this._home = undefined;
        }
        if (displayHome) {
            this._initHome(app);
        }
    };

    private async _initHome(app: IApplication) {
        this._home = new Home(app);
        await this._home.render();
    }

    private async _initEditor(app: IApplication) {
        this._editor = new Editor(app, this.tabs);
    }

    registerHomeCommand(groupName: I18nKeys, command: CommandKeys | Button): void {
        throw new Error("Method not implemented.");
    }

    registerRibbonCommand(tabName: I18nKeys, groupName: I18nKeys, command: CommandKeys | Button) {
        this._editor?.registerRibbonCommand(tabName, groupName, command);
    }

    setTheme(theme: "light" | "dark") {
        document.documentElement.setAttribute("theme", theme);
    }
}
