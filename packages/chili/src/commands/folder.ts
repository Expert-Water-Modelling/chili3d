// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, FolderNode, IApplication, ICommand } from "chili-core";

let index = 1;

@command({
    name: "create.boundary",
    display: "command.newBoundary",
    icon: "icon-folder-plus",
})
export class NewBoundary implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = app.activeView?.document!;
        const boundary = new FolderNode(document, `Boundary${index++}`);
        document.addNode(boundary);
        // Initialize boundary type as wall by default
        document.boundaryTypes.set(boundary.id, "wall");
    }
}
