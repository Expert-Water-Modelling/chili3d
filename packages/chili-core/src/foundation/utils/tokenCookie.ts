// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

const TOKEN_COOKIE = "token";

export const readTokenCookie = (): string | null => {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
};

export const clearTokenCookie = (): void => {
    if (typeof document === "undefined") return;
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
};
