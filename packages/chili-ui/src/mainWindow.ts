// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { getProjectNameFromUrl } from "chili";
import {
    Button,
    CommandKeys,
    Constants,
    I18nKeys,
    IApplication,
    IDocument,
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

        // Get the project name from URL
        const projectName = getProjectNameFromUrl();
        console.log("Initializing with project name:", projectName);

        // Check if document is already initialized using localStorage
        const isInitialized = localStorage.getItem(MainWindow.DOC_INIT_KEY) === "true";
        if (isInitialized) {
            console.log("Document already initialized, skipping document creation");
            return;
        }

        let document: IDocument | undefined;

        // Try to find an existing document with this name
        const recentDocs = await app.storage.page(Constants.DBName, Constants.RecentTable, 0);
        if (recentDocs && recentDocs.length > 0) {
            // Look for a document with matching name
            const matchingDoc = recentDocs.find((doc) => doc.name === projectName);
            if (matchingDoc) {
                console.log("Found existing document:", matchingDoc);
                document = await app.openDocument(matchingDoc.id);
            }
        }

        // If no document was found, create a new one
        if (!document) {
            console.log("Creating new document with name:", projectName);
            document = await app.newDocument(projectName);
            if (!document) {
                throw new Error("Failed to create default document");
            }
            // Ensure the document is saved to appear in recent documents
            await document.save();
        }

        // Mark document as initialized in localStorage
        localStorage.setItem(MainWindow.DOC_INIT_KEY, "true");

        // Switch to document view and ensure command system is ready
        PubSub.default.pub("displayHome", false);

        // Ensure the view is properly initialized
        if (app.activeView) {
            app.activeView.update();
            app.activeView.cameraController.fitContent();
        }
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
