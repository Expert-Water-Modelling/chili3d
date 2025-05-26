// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Constants,
    I18n,
    I18nKeys,
    IApplication,
    ObservableCollection,
    PubSub,
    RecentDocumentDTO,
} from "chili-core";
import { LanguageSelector, a, button, collection, div, img, localize, span, svg } from "../components";
import style from "./home.module.css";

interface ApplicationCommand {
    display: I18nKeys;
    icon?: string;
    onclick: () => void;
}

const applicationCommands = new ObservableCollection<ApplicationCommand>(
    {
        display: "command.document.open",
        onclick: () => PubSub.default.pub("executeCommand", "doc.open"),
    },
    {
        display: "command.document.new",
        onclick: () => PubSub.default.pub("executeCommand", "doc.new"),
    },
);

export class Home extends HTMLElement {
    constructor(readonly app: IApplication) {
        super();
        this.className = style.root;
    }

    private hasOpen(documentId: string) {
        for (const document of this.app.documents) {
            if (document.id === documentId) return true;
        }
        return false;
    }

    private async getDocuments() {
        const documents = new ObservableCollection<RecentDocumentDTO>();

        // Always add the current document
        if (this.app.activeView?.document) {
            const currentDoc = this.app.activeView.document;
            // Ensure we have a preview image
            this.app.activeView.update();
            const image = this.app.activeView.toImage();
            documents.push({
                id: currentDoc.id,
                name: currentDoc.name,
                date: Date.now(),
                image: image || "",
            });
        }

        return documents;
    }

    async render() {
        const documents = await this.getDocuments();
        this.append(
            this.leftSection(),
            this.rightSection(documents),
            LanguageSelector({ className: style.language }),
        );
        document.body.appendChild(this);
    }

    private leftSection() {
        return div(
            { className: style.left },
            div({ className: style.top }, this.applicationCommands(), this.currentDocument()),
            this.links(),
        );
    }

    private applicationCommands() {
        return collection({
            className: style.buttons,
            sources: applicationCommands,
            template: (item) =>
                button({
                    className: style.button,
                    textContent: localize(item.display),
                    onclick: item.onclick,
                }),
        });
    }

    private currentDocument() {
        return this.app.activeView?.document
            ? button({
                  className: `${style.button} ${style.back}`,
                  textContent: localize("common.back"),
                  onclick: () => {
                      PubSub.default.pub("displayHome", false);
                  },
              })
            : "";
    }

    private links() {
        return div(
            { className: style.bottom },
            a({ href: "https://github.com/chili3d/chili3d", textContent: "GitHub" }),
            a({ href: "https://chili3d.com", textContent: "Websites" }),
        );
    }

    private rightSection(documents: ObservableCollection<RecentDocumentDTO>) {
        return div(
            { className: style.right },
            div({ className: style.recent, textContent: localize("home.recent") }),
            this.documentCollection(documents),
        );
    }

    private documentCollection(documents: ObservableCollection<RecentDocumentDTO>) {
        return collection({
            className: style.documents,
            sources: documents,
            template: (item) => this.recentDocument(item, documents),
        });
    }

    private recentDocument(item: RecentDocumentDTO, documents: ObservableCollection<RecentDocumentDTO>) {
        return div(
            {
                className: style.document,
                onclick: () => this.handleDocumentClick(item),
            },
            img({ className: style.img, src: item.image }),
            this.documentDescription(item),
            this.deleteIcon(item, documents),
        );
    }

    private documentDescription(item: RecentDocumentDTO) {
        return div(
            { className: style.description },
            span({ className: style.title, textContent: item.name }),
            span({
                className: style.date,
                textContent: new Date(item.date).toLocaleDateString(),
            }),
        );
    }

    private handleDocumentClick(item: RecentDocumentDTO) {
        if (this.hasOpen(item.id)) {
            PubSub.default.pub("displayHome", false);
        } else {
            PubSub.default.pub(
                "showPermanent",
                async () => {
                    let document = await this.app.openDocument(item.id);
                    await document?.application.activeView?.cameraController.fitContent();
                },
                "toast.excuting{0}",
                I18n.translate("command.document.open"),
            );
        }
    }

    private deleteIcon(item: RecentDocumentDTO, documents: ObservableCollection<RecentDocumentDTO>) {
        if (this.app.activeView?.document?.id === item.id) {
            return div();
        }

        return svg({
            className: style.delete,
            icon: "icon-times",
            onclick: async (e) => {
                e.stopPropagation();
                if (window.confirm(I18n.translate("prompt.deleteDocument{0}", item.name))) {
                    await Promise.all([
                        this.app.storage.delete(Constants.DBName, Constants.DocumentTable, item.id),
                        this.app.storage.delete(Constants.DBName, Constants.RecentTable, item.id),
                    ]);
                    documents.remove(item);
                }
            },
        });
    }
}

customElements.define("chili-home", Home);
