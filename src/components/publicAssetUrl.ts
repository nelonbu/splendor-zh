/** Map an asset copied from public/ to the current Vite site base. */
export function publicAssetUrl(path: string, base = import.meta.env.BASE_URL): string {
  return `${base}${path.replace(/^\//, '')}`;
}
