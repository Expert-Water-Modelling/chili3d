// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios from "axios";
import { command, IApplication, ICommand, PubSub } from "chili-core";

@command({
    name: "doc.open",
    display: "command.document.open",
    icon: "icon-import",
})
export class LoadProjectData implements ICommand {
    private readonly API_BASE_URL = "http://37.59.205.2:8000";

    async execute(app: IApplication): Promise<void> {
        try {
            // Get project ID and user ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get("id");
            const userId = urlParams.get("user_id");

            if (!projectId || !userId) {
                throw new Error(`Missing required parameters. Project ID: ${projectId}, User ID: ${userId}`);
            }

            // Try to load project data from server
            const response = await axios.get(
                `${this.API_BASE_URL}/download_project_data/${userId}/${projectId}`,
                {
                    headers: {
                        accept: "application/json",
                    },
                },
            );

            if (response.data) {
                // If we have data, load it into the application
                // You'll need to implement the logic to load the data into your application
                // This might involve parsing the data and updating the document structure
                console.log("Project data loaded successfully:", response.data);
                PubSub.default.pub("showToast", "toast.document.sent");
            } else {
                // If no data exists, show a message to the user
                console.log("No project data found for this project");
                PubSub.default.pub("showToast", "toast.fail");
            }
        } catch (error) {
            console.error("Load project data error:", error);
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 404) {
                    // Project data doesn't exist
                    PubSub.default.pub("showToast", "toast.fail");
                } else {
                    console.error("API Error:", {
                        status: error.response?.status,
                        data: error.response?.data,
                        message: error.message,
                    });
                    PubSub.default.pub("showToast", "toast.fail");
                }
            }
        }
    }
}
