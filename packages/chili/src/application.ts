// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import {
    DOCUMENT_FILE_EXTENSION,
    EditableShapeNode,
    FolderNode,
    I18n,
    IApplication,
    ICommand,
    IDataExchange,
    IDocument,
    INode,
    IService,
    IShapeFactory,
    IStorage,
    IView,
    IVisualFactory,
    IWindow,
    Material,
    ObservableCollection,
    Plane,
    PubSub,
    Serialized,
} from "chili-core";
import { Document } from "./document";
import { StateChangeDetector, StateChangeResult } from "./stateChangeDetector";
import { importFiles } from "./utils";

// Get the API base URL from environment variable
const API_BASE_URL = process.env["API_BASE_URL"] || "http://localhost:8000";

let app: Application | undefined;

// Global function to get the application instance
export function getApplication(): Application | undefined {
    return app;
}

// Make the getter function globally accessible
(window as any).getApplication = getApplication;

export interface ApplicationOptions {
    visualFactory: IVisualFactory;
    shapeFactory: IShapeFactory;
    services: IService[];
    storage: IStorage;
    dataExchange: IDataExchange;
    mainWindow?: IWindow;
}

export class Application implements IApplication {
    readonly dataExchange: IDataExchange;
    readonly visualFactory: IVisualFactory;
    readonly shapeFactory: IShapeFactory;
    readonly services: IService[];
    readonly storage: IStorage;
    readonly mainWindow?: IWindow;

    readonly views = new ObservableCollection<IView>();
    readonly documents: Set<IDocument> = new Set<IDocument>();

    executingCommand: ICommand | undefined;

    private _activeView: IView | undefined;
    get activeView(): IView | undefined {
        return this._activeView;
    }
    set activeView(value: IView | undefined) {
        if (this._activeView === value) return;
        this._activeView = value;
        PubSub.default.pub("activeViewChanged", value);
    }

    private isInitializing: boolean = true;
    public stateChangeDetector: StateChangeDetector = new StateChangeDetector();

    constructor(option: ApplicationOptions) {
        if (app !== undefined) {
            throw new Error("Only one application can be created");
        }
        app = this;

        // Make the app instance globally accessible
        (window as any).app = this;

        this.visualFactory = option.visualFactory;
        this.shapeFactory = option.shapeFactory;
        this.services = option.services;
        this.storage = option.storage;
        this.dataExchange = option.dataExchange;
        this.mainWindow = option.mainWindow;

        this.services.forEach((x) => x.register(this));
        this.services.forEach((x) => x.start());

        this.initWindowEvents();

        // Create new document and load STEP file on initialization
        this.initializeDocument()
            .catch((error) => {
                console.error("Failed to initialize document:", error);
            })
            .finally(() => {
                this.isInitializing = false;
            });
    }

    private initWindowEvents() {
        window.onbeforeunload = this.handleWindowUnload;
        window.addEventListener(
            "dragstart",
            (ev) => {
                ev.preventDefault();
            },
            false,
        );
        window.addEventListener(
            "dragover",
            (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                ev.dataTransfer!.dropEffect = "copy";
            },
            false,
        );
        window.addEventListener(
            "drop",
            (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                this.importFiles(ev.dataTransfer?.files);
            },
            false,
        );
    }

    private readonly handleWindowUnload = (event: BeforeUnloadEvent) => {
        if (!this.isInitializing && this.activeView) {
            event.preventDefault();
            event.returnValue = "";
        }
    };

    async importFiles(files: FileList | undefined) {
        if (!files || files.length === 0) {
            return;
        }
        const { opens, imports } = this.groupFiles(files);
        this.loadDocumentsWithLoading(opens);
        importFiles(this, imports);
    }

    private loadDocumentsWithLoading(opens: File[]) {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                const file = opens[0];
                if (file) {
                    if (this.activeView?.document) {
                        await this.activeView.document.close();
                    }

                    const originalBeforeUnload = window.onbeforeunload;
                    window.onbeforeunload = null;

                    let json: Serialized = JSON.parse(await file.text());
                    await this.loadDocument(json);
                    this.activeView?.cameraController.fitContent();

                    window.onbeforeunload = originalBeforeUnload;
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.document.open"),
        );
    }

    private groupFiles(files: FileList) {
        const opens: File[] = [];
        const imports: File[] = [];
        for (const element of files) {
            if (element.name.endsWith(DOCUMENT_FILE_EXTENSION)) {
                opens.push(element);
            } else {
                imports.push(element);
            }
        }
        return { opens, imports };
    }

    async openDocument(id: string): Promise<IDocument | undefined> {
        const document = await Document.open(this, id);
        await this.createActiveView(document);
        return document;
    }

    async newDocument(name: string): Promise<IDocument> {
        if (this.activeView?.document) {
            // Override close method to prevent save prompt
            const originalClose = this.activeView.document.close;
            this.activeView.document.close = async function () {
                let views = this.application.views.filter((x) => x.document === this);
                this.application.views.remove(...views);
                this.application.activeView = this.application.views.at(0);
                this.application.documents.delete(this);
                PubSub.default.pub("documentClosed", this);
                this.dispose();
            };
            await this.activeView.document.close();
        }

        const document = new Document(this, name);

        const lightGray = new Material(document, "LightGray", 0xdedede);
        const deepGray = new Material(document, "DeepGray", 0x898989);
        document.materials.push(lightGray, deepGray);

        await this.createActiveView(document);

        if (document.rootNode) {
            document.rootNode.name = name;
        }

        // Override the new document's close method to prevent save prompt
        const originalClose = document.close;
        document.close = async function () {
            let views = this.application.views.filter((x) => x.document === this);
            this.application.views.remove(...views);
            this.application.activeView = this.application.views.at(0);
            this.application.documents.delete(this);
            PubSub.default.pub("documentClosed", this);
            this.dispose();
        };

        PubSub.default.pub("closeCommandContext");

        return document;
    }

    async loadDocument(data: Serialized): Promise<IDocument | undefined> {
        const document = await Document.load(this, data);
        await this.createActiveView(document);
        return document;
    }

    protected async createActiveView(document: IDocument | undefined) {
        if (document === undefined) return undefined;

        const view = document.visual.createView("3d", Plane.XY);

        this.activeView = view;

        view.cameraController.fitContent();

        view.update();

        return view;
    }

    private async fetchAndStoreProjectJson(userId: string, projectId: string): Promise<void> {
        try {
            const timestamp = Date.now();
            const response = await axios.get(
                `${API_BASE_URL}/download_project_json/${userId}/${projectId}?t=${timestamp}`,
                {
                    headers: {
                        accept: "application/json",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                },
            );
            const projectJson = response.data;
            localStorage.setItem("projectJson", JSON.stringify(projectJson));
            this.processProjectJson(projectJson);
            // Sync document node tree with projectJson
            if (this.activeView?.document) {
                this.syncDocumentWithProjectJson(this.activeView.document, projectJson);
            }
        } catch (error) {
            console.error("Failed to fetch and store project.json:", error);
        }
    }

    private processProjectJson(projectJson: any): void {
        const groups = projectJson.groups || [];
        const faces = projectJson.faces || [];
        let faceCounter = 1;

        groups.forEach((group: any) => {
            const groupName = group.name;
            const faceIds = group.faceIds || [];
            const groupFaces = faces.filter((face: any) => faceIds.includes(face.id));

            // Create a folder in the items panel for the group
            console.log(`Creating folder for group: ${groupName} with faceIds: ${faceIds.join(", ")}`);

            // Sync face names in the items panel
            groupFaces.forEach((face: any) => {
                // Update the face name in the items panel with sequential numbering
                const newFaceName = `Face ${faceCounter}`;
                console.log(`Syncing face name: ${newFaceName} with ID: ${face.id}`);

                // Find and update the face in the items panel
                const faceInPanel = this.findFaceInPanel(face.id);
                if (faceInPanel) {
                    faceInPanel.name = newFaceName;
                }
                faceCounter++;
            });
        });
    }

    private findFaceInPanel(faceId: string): any {
        // Implement the logic to find the face in the items panel by ID
        const rootNode = this.activeView?.document?.rootNode;
        if (rootNode && INode.isLinkedListNode(rootNode)) {
            let node = rootNode.firstChild;
            while (node) {
                if (node.id === faceId) {
                    return node;
                }
                node = node.nextSibling;
            }
        }
        return null;
    }

    private async initializeDocument(): Promise<void> {
        try {
            // Get project ID and user ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get("id");
            const userId = urlParams.get("user_id");
            const projectName = urlParams.get("name") || "Default Project";

            if (!projectId || !userId) {
                console.log("No project ID or user ID found in URL");
                return;
            }

            // Close existing document if any
            if (this.activeView?.document) {
                await this.activeView.document.close();
            }

            // Create a new document
            const document = await this.newDocument(projectName);
            if (!document) {
                throw new Error("Failed to create new document");
            }

            // Save document to appear in recent documents
            await document.save();

            // Switch to document view
            PubSub.default.pub("displayHome", false);

            // Load step file
            await this.loadStepFile(userId, projectId, document);

            // Fetch and store project.json
            await this.fetchAndStoreProjectJson(userId, projectId);

            // Wait for document to be fully stable before creating snapshot
            console.log("Waiting for document to stabilize before creating snapshot...");
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds for any async operations

            // Force a final visual update to ensure everything is settled
            if (document.application.activeView) {
                document.application.activeView.update();
                document.visual.update();
            }

            // Create initial state snapshot after document is fully loaded and stable
            console.log("Creating initial state snapshot...");
            this.createInitialStateSnapshot();
            console.log("Application initialization completed with state snapshot created");
        } catch (error) {
            console.error("Initialize document error:", error);
            PubSub.default.pub("showToast", "toast.fail");
        }
    }

    private async loadStepFile(userId: string, projectId: string, document: IDocument): Promise<void> {
        try {
            const timestamp = Date.now();
            const response = await axios.get(
                `${API_BASE_URL}/download_project_step_file/${userId}/${projectId}?t=${timestamp}`,
                {
                    headers: {
                        accept: "application/json",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                        Expires: "0",
                    },
                    responseType: "arraybuffer",
                },
            );

            // Check if the response contains actual file data
            if (response.data && response.data.byteLength > 0) {
                // Convert the response data to Uint8Array
                const stepData = new Uint8Array(response.data);

                // Use the shape factory's converter to import the STEP file
                const result = await document.application.shapeFactory.converter.convertFromSTEP(
                    document,
                    stepData,
                );

                if (result?.isOk) {
                    const folder = result.value;

                    // Set the folder name
                    folder.name = "model.step";

                    // Add the folder to the document
                    document.addNode(folder);

                    // Force a visual update
                    document.visual.update();

                    // Ensure the view is updated and fits content
                    if (document.application.activeView) {
                        document.application.activeView.update();
                        document.application.activeView.cameraController.fitContent();
                    }

                    // Force another visual update after fitting content
                    document.visual.update();

                    // Rename all faces sequentially
                    let faceCounter = 1;
                    const renameFaces = (node: INode) => {
                        if (node instanceof EditableShapeNode) {
                            node.name = `Face ${faceCounter}`;
                            faceCounter++;
                        }
                        if (INode.isLinkedListNode(node)) {
                            let child = node.firstChild;
                            while (child) {
                                renameFaces(child);
                                child = child.nextSibling;
                            }
                        }
                    };
                    renameFaces(folder);

                    // Update the visual representation after renaming
                    document.visual.update();

                    PubSub.default.pub("showToast", "toast.document.sent");
                } else {
                    console.error("Failed to import STEP file:", result?.error);
                    PubSub.default.pub("showToast", "toast.fail");
                }
            } else {
                // No file data in response
                console.log("No STEP file data received from server");
            }
        } catch (error) {
            console.error("=== STEP FILE DOWNLOAD ERROR ===");
            if (axios.isAxiosError(error)) {
                console.error("Request URL:", `${API_BASE_URL}/download_project_step_file/${userId}/${projectId}`);
                console.error("Status:", error.response?.status);
                console.error("Status Text:", error.response?.statusText);
                console.error("Response Headers:", error.response?.headers);
                console.error("Response Data:", error.response?.data);
                console.error("Error Message:", error.message);
                console.error("Error Code:", error.code);
                
                if (error.response?.status === 404) {
                    console.error("STEP file not found on server (404)");
                    PubSub.default.pub("showToast", "toast.read.error");
                } else if (error.code === "ECONNREFUSED") {
                    console.error("Connection refused - server may be down");
                    PubSub.default.pub("showToast", "toast.fail");
                } else if (error.code === "ERR_NETWORK") {
                    console.error("Network error - possible CORS issue");
                    PubSub.default.pub("showToast", "toast.fail");
                } else {
                    console.error("Load STEP file error:", error);
                    PubSub.default.pub("showToast", "toast.fail");
                }
            } else {
                console.error("Non-axios error:", error);
                PubSub.default.pub("showToast", "toast.fail");
            }
            console.error("=== END ERROR ===");
        }
    }

    private createFileList(files: File[]): FileList {
        const dataTransfer = new DataTransfer();
        files.forEach((file) => dataTransfer.items.add(file));
        return dataTransfer.files;
    }

    private syncDocumentWithProjectJson(document: IDocument, projectJson: any) {
        const groups = projectJson.groups || [];
        const faces = projectJson.faces || [];
        const root = document.rootNode;
        console.log("root", root);
        let faceCounter = 1;

        // Helper to find or create a group node (folder)
        function findOrCreateGroupNode(group: any): FolderNode {
            let node = root.firstChild;
            while (node) {
                if (node.id === group.id) return node as FolderNode;
                node = node.nextSibling;
            }
            const newGroup = new FolderNode(document, group.name, group.id);
            root.add(newGroup);
            return newGroup;
        }

        // Helper to recursively find a face node by id
        function findFaceNodeRecursive(node: any, faceId: string): any {
            if (node.id === faceId) return node;
            if ("firstChild" in node && node.firstChild) {
                let child = node.firstChild;
                while (child) {
                    const found = findFaceNodeRecursive(child, faceId);
                    if (found) return found;
                    child = child.nextSibling;
                }
            }
            return null;
        }

        // 1. Create or update group folders
        // groups.forEach((group: any) => {
        //     let groupNode = findOrCreateGroupNode(group);
        //     groupNode.name = group.name;

        //     // 2. Place faces in the correct group and update their names
        //     group.faceIds.forEach((faceId: string) => {
        //         const faceData = faces.find((f: any) => f.id === faceId);
        //         if (!faceData) return;
        //         let faceNode = findFaceNodeRecursive(root, faceId);
        //         if (faceNode) {
        //             // Update face name with sequential numbering
        //             faceNode.name = `Face ${faceCounter}`;
        //             faceCounter++;

        //             // Move faceNode under groupNode if not already
        //             if (faceNode.parent !== groupNode) {
        //                 faceNode.parent?.remove(faceNode);
        //                 groupNode.add(faceNode);
        //             }
        //         }
        //     });
        // });
    }

    /**
     * Creates an initial snapshot of the current document state
     */
    createInitialStateSnapshot(): void {
        if (this.activeView?.document) {
            this.stateChangeDetector.createInitialSnapshot(this.activeView.document);
        }
    }

    /**
     * Checks for changes and shows dialog if needed
     */
    async checkForStateChanges(): Promise<StateChangeResult> {
        if (this.activeView?.document) {
            return await this.stateChangeDetector.checkForChanges(this.activeView.document);
        }
        return "no_changes";
    }

    /**
     * Resets the state snapshot (useful after saving)
     */
    resetStateSnapshot(): void {
        if (this.activeView?.document) {
            this.stateChangeDetector.resetSnapshot(this.activeView.document);
        }
    }
}
