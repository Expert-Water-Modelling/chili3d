// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import {
    CollectionAction,
    CollectionChangedArgs,
    Constants,
    FolderNode,
    History,
    I18n,
    IApplication,
    IDocument,
    INode,
    INodeChangedObserver,
    INodeLinkedList,
    ISelection,
    IVisual,
    Id,
    Logger,
    Material,
    NodeLinkedListHistoryRecord,
    NodeRecord,
    NodeSerializer,
    Observable,
    ObservableCollection,
    PubSub,
    Serialized,
    Serializer,
    Transaction,
} from "chili-core";
import { Selection } from "./selection";

export class Document extends Observable implements IDocument {
    readonly visual: IVisual;
    readonly history: History;
    readonly selection: ISelection;
    readonly materials: ObservableCollection<Material> = new ObservableCollection();
    readonly boundaryTypes: Map<string, string> = new Map();

    private readonly _nodeChangedObservers = new Set<INodeChangedObserver>();

    static readonly version = __DOCUMENT_VERSION__;

    get name(): string {
        return this.getPrivateValue("name");
    }
    set name(name: string) {
        if (this.name === name) return;
        this.setProperty("name", name);
        if (this._rootNode) this._rootNode.name = name;
    }

    private _rootNode: INodeLinkedList | undefined;
    @Serializer.serialze()
    get rootNode(): INodeLinkedList {
        if (this._rootNode === undefined) {
            this.setRootNode(this.initRootNode());
        }
        return this._rootNode!;
    }
    set rootNode(value: INodeLinkedList) {
        this.setRootNode(value);
    }

    private setRootNode(value?: INodeLinkedList) {
        if (this._rootNode === value) return;
        this._rootNode?.removePropertyChanged(this.handleRootNodeNameChanged);
        this._rootNode = value ?? new FolderNode(this, this.name);
        this._rootNode.onPropertyChanged(this.handleRootNodeNameChanged);
    }

    private _currentNode?: INodeLinkedList;
    get currentNode(): INodeLinkedList | undefined {
        return this._currentNode;
    }
    set currentNode(value: INodeLinkedList | undefined) {
        this.setProperty("currentNode", value);
    }

    constructor(
        readonly application: IApplication,
        name: string,
        readonly id: string = Id.generate(),
    ) {
        super();
        this.setPrivateValue("name", name);
        this.history = new History();
        this.visual = application.visualFactory.create(this);
        this.selection = new Selection(this);
        this.materials.onCollectionChanged(this.handleMaterialChanged);
        application.documents.add(this);

        Logger.info(`new document: ${name}`);
    }

    private readonly handleRootNodeNameChanged = (prop: string) => {
        if (prop === "name") {
            this.name = this.rootNode.name;
        }
    };

    initRootNode() {
        const rootNode = new FolderNode(this, this.name);
        // Ensure the root node is properly initialized
        rootNode.visible = true;
        rootNode.parentVisible = true;
        return rootNode;
    }

    serialize(): Serialized {
        let serialized = {
            classKey: "Document",
            version: __DOCUMENT_VERSION__,
            properties: {
                id: this.id,
                name: this.name,
                nodes: NodeSerializer.serialize(this.rootNode),
                materials: this.materials.map((x) => Serializer.serializeObject(x)),
                boundaryTypes: Array.from(this.boundaryTypes.entries()),
                lastModified: Date.now(), // Add timestamp to track data freshness
            },
        } as Serialized;
        return serialized;
    }

    override disposeInternal(): void {
        super.disposeInternal();
        this._nodeChangedObservers.clear();
        this._rootNode?.removePropertyChanged(this.handleRootNodeNameChanged);
        this._rootNode?.dispose();
        this.visual.dispose();
        this.history.dispose();
        this.selection.dispose();
        this.materials.forEach((x) => x.dispose());
        this.materials.clear();

        this._rootNode = undefined;
        this._currentNode = undefined;
    }

    async save() {
        const data = this.serialize();
        console.log("Saving document:", this.name, "with ID:", this.id);

        // Get project ID and user ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get("id");
        const userId = urlParams.get("user_id");

        // If we have project and user IDs, save to API first
        if (projectId && userId) {
            try {
                const timestamp = Date.now();
                // Create a Blob from the document data
                const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
                // Create a File object
                const file = new File([blob], `${this.name}.cd`, { type: "application/json" });
                // Create FormData and append the file
                const formData = new FormData();
                formData.append("file", file);

                await axios.post(
                    `http://37.59.205.2:8000/upload_project_files/${userId}/${projectId}?t=${timestamp}`,
                    formData,
                    {
                        headers: {
                            accept: "application/json",
                            "Content-Type": "multipart/form-data",
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            Pragma: "no-cache",
                            Expires: "0",
                        },
                    },
                );
                Logger.info("Document saved to API successfully");
            } catch (error) {
                console.error("Failed to save document to API:", error);
                throw error; // Re-throw to prevent saving to local storage if API save fails
            }
        }

        // Only save to local storage if API save was successful or if we don't have project/user IDs
        await this.application.storage.put(Constants.DBName, Constants.DocumentTable, this.id, data);

        // Save metadata for recent documents
        const image = this.application.activeView?.toImage();
        await this.application.storage.put(Constants.DBName, Constants.RecentTable, this.id, {
            id: this.id,
            name: this.name,
            date: Date.now(),
            image,
        });

        console.log("Document saved successfully");
    }

    async close() {
        if (window.confirm(I18n.translate("prompt.saveDocument{0}", this.name))) {
            await this.save();
        }

        let views = this.application.views.filter((x) => x.document === this);
        this.application.views.remove(...views);
        this.application.activeView = this.application.views.at(0);
        this.application.documents.delete(this);
        this.materials.removeCollectionChanged(this.handleMaterialChanged);
        PubSub.default.pub("documentClosed", this);

        Logger.info(`document: ${this.name} closed`);
        this.dispose();
    }

    static async open(application: IApplication, id: string) {
        try {
            // Get project ID, user ID, and name from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get("id");
            const userId = urlParams.get("user_id");
            const documentName = urlParams.get("name");

            let data: Serialized | undefined;

            // If we have project and user IDs, try to get fresh data from API first
            if (projectId && userId) {
                try {
                    // Get fresh data from API with timestamp to prevent caching
                    const timestamp = Date.now();
                    const response = await axios.get(
                        `http://37.59.205.2:8000/download_project_data/${userId}/${projectId}?t=${timestamp}`,
                        {
                            headers: {
                                accept: "application/json",
                                "Cache-Control": "no-cache, no-store, must-revalidate",
                                Pragma: "no-cache",
                                Expires: "0",
                            },
                        },
                    );

                    if (response.data) {
                        data = response.data;
                        // If we have a name parameter, update the document name in the data
                        if (documentName && data?.properties) {
                            data.properties["name"] = documentName;
                        }
                        // Save fresh data to local storage
                        if (data) {
                            await application.storage.put(
                                Constants.DBName,
                                Constants.DocumentTable,
                                id,
                                data,
                            );
                            Logger.info("Fresh data loaded from API and saved to local storage");
                        }
                    } else {
                        throw new Error("No data received from API");
                    }
                } catch (error) {
                    console.error("Failed to fetch document from API:", error);
                    // Don't fall back to local storage if API fetch fails
                    throw error;
                }
            } else {
                // If no project/user IDs, try local storage
                data = (await application.storage.get(
                    Constants.DBName,
                    Constants.DocumentTable,
                    id,
                )) as Serialized;
                if (data) {
                    // If we have a name parameter, update the document name in the data
                    if (documentName && data.properties) {
                        data.properties["name"] = documentName;
                    }
                    Logger.info("Document loaded from local storage");
                }
            }

            // If document exists in either source, load it
            if (data) {
                let document = await this.load(application, data);
                if (document !== undefined) {
                    // Update document name if URL parameter exists
                    if (documentName) {
                        // Update both document name and root node name
                        document.name = documentName;
                        if (document.rootNode) {
                            document.rootNode.name = documentName;
                        }
                    }
                    Logger.info(`document: ${document.name} opened`);
                    // Force a save to ensure everything is in sync
                    await document.save();
                }
                return document;
            }

            // If document doesn't exist anywhere, create a new one with the name from URL if available
            Logger.info(`Creating new document with ID: ${id}`);
            const newDocument = new Document(application, documentName || "Untitled", id);
            await newDocument.save();
            return newDocument;
        } catch (error) {
            console.error("Error opening document:", error);
            return undefined;
        }
    }

    static async load(app: IApplication, data: Serialized): Promise<IDocument | undefined> {
        try {
            // Validate data structure
            if (!data || !data.properties) {
                console.error("Invalid document data: missing properties");
                return undefined;
            }

            // Get name from URL if available
            const urlParams = new URLSearchParams(window.location.search);
            const documentName = urlParams.get("name");

            // Create new document with the data
            let document = new Document(app, documentName || data.properties["name"], data.properties["id"]);
            document.history.disabled = true;

            // Safely load materials
            if (Array.isArray(data.properties["materials"])) {
                document.materials.push(
                    ...data.properties["materials"].map((x: Serialized) =>
                        Serializer.deserializeObject(document, x),
                    ),
                );
            }

            // Safely load boundary types
            if (data.properties["boundaryTypes"]) {
                data.properties["boundaryTypes"].forEach(([id, type]: [string, string]) => {
                    document.boundaryTypes.set(id, type);
                });
            }

            // Safely load nodes
            if (data.properties["nodes"]) {
                const rootNode = await NodeSerializer.deserialize(document, data.properties["nodes"]);
                // Ensure root node name matches document name
                if (rootNode) {
                    rootNode.name = documentName || data.properties["name"];
                    document.setRootNode(rootNode);
                } else {
                    throw new Error("Failed to deserialize root node");
                }
            } else {
                throw new Error("Invalid document data: missing nodes property");
            }

            document.history.disabled = false;
            return document;
        } catch (error) {
            console.error("Error loading document:", error);
            return undefined;
        }
    }

    private readonly handleMaterialChanged = (args: CollectionChangedArgs) => {
        if (args.action === CollectionAction.add) {
            Transaction.add(this, {
                name: "MaterialChanged",
                dispose() {},
                undo: () => this.materials.remove(...args.items),
                redo: () => this.materials.push(...args.items),
            });
        } else if (args.action === CollectionAction.remove) {
            Transaction.add(this, {
                name: "MaterialChanged",
                dispose() {},
                undo: () => this.materials.push(...args.items),
                redo: () => this.materials.remove(...args.items),
            });
        }
    };

    addNodeObserver(observer: INodeChangedObserver) {
        this._nodeChangedObservers.add(observer);
    }

    removeNodeObserver(observer: INodeChangedObserver) {
        this._nodeChangedObservers.delete(observer);
    }

    notifyNodeChanged(records: NodeRecord[]) {
        Transaction.add(this, new NodeLinkedListHistoryRecord(records));
        this._nodeChangedObservers.forEach((x) => x.handleNodeChanged(records));
    }

    addNode(...nodes: INode[]): void {
        (this.currentNode ?? this.rootNode).add(...nodes);
    }
}
