/** Absolute paths of the administration: relative links inside the admin/*
 * splat route would resolve against the whole URL. */
export const adminPath = (section: string) => `/admin/${section}`;
