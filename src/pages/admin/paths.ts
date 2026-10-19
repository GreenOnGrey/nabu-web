/** Absolute paths of the administration: relative links inside the admin/*
 * splat route would resolve against the whole URL. */
export const adminPath = (section: string) => `/admin/${section}`;

/** The pages of the administration: `/admin` and below it. */
export const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/");
