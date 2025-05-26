// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import {
    DOCUMENT_FILE_EXTENSION,
    I18n,
    IApplication,
    ICommand,
    IDataExchange,
    IDocument,
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
import { importFiles } from "./utils";

let app: Application | undefined;

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

    constructor(option: ApplicationOptions) {
        if (app !== undefined) {
            throw new Error("Only one application can be created");
        }
        app = this;
        this.visualFactory = option.visualFactory;
        this.shapeFactory = option.shapeFactory;
        this.services = option.services;
        this.storage = option.storage;
        this.dataExchange = option.dataExchange;
        this.mainWindow = option.mainWindow;

        this.services.forEach((x) => x.register(this));
        this.services.forEach((x) => x.start());

        this.initWindowEvents();

        // Only try to load project data
        this.loadProjectData()
            .catch((error) => {
                console.error("Failed to load project data:", error);
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

    async loadProjectData(): Promise<void> {
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

            // Try to load project data from server
            const response = await axios.get(
                `http://37.59.205.2:8000/download_project_data/${userId}/${projectId}`,
                { headers: { accept: "application/json" } },
            );

            if (response.data) {
                // Close existing document if any
                if (this.activeView?.document) {
                    const originalBeforeUnload = window.onbeforeunload;
                    window.onbeforeunload = null;
                    await this.activeView.document.close();
                    window.onbeforeunload = originalBeforeUnload;
                }

                // Load the new document
                const document = await this.loadDocument(response.data);
                if (document && document.application.activeView) {
                    document.application.activeView.update();
                    document.application.activeView.cameraController.fitContent();
                }
            }
            // If no data, do nothing (do not create a new document)
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                // Project file not found: do nothing!
                console.log("Project data not found, not creating a new document.");
            } else {
                // Handle other errors as needed
                console.error("Load project data error:", error);
                PubSub.default.pub("showToast", "toast.fail");
            }
        }
    }

    private createFileList(files: File[]): FileList {
        const dataTransfer = new DataTransfer();
        files.forEach((file) => dataTransfer.items.add(file));
        return dataTransfer.files;
    }
}
