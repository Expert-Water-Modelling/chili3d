// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { clearTokenCookie, readTokenCookie } from "./tokenCookie";

const API_BASE_URL = process.env["API_BASE_URL"] || "http://localhost:8000";
const TOKEN_KEY = "token";
const AUTH_ENTRY_PATH_RE = /\/(login|register|admin\/manager-login)(\b|$)/;

export const apiService = axios.create({
    baseURL: API_BASE_URL,
});

apiService.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const cached = localStorage.getItem(TOKEN_KEY);
    const token = cached || readTokenCookie();
    if (token) {
        if (!cached) localStorage.setItem(TOKEN_KEY, token);
        config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
});

apiService.interceptors.response.use(
    (r) => r,
    (error: AxiosError) => {
        const status = error?.response?.status;
        const url = error?.config?.url || "";
        if (status === 401 && !AUTH_ENTRY_PATH_RE.test(url)) {
            localStorage.removeItem(TOKEN_KEY);
            clearTokenCookie();
            if (typeof window !== "undefined" && window.location.pathname !== "/login") {
                window.location.replace("/login");
            }
        }
        return Promise.reject(error);
    },
);
