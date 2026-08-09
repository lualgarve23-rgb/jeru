// Helper sem dependência de fs — importável por páginas e componentes client.
// Converte o valor guardado no banco (chave "media:..." ou data URI legado)
// na URL que o <img> deve usar.

const MEDIA_PREFIX = "media:";

export function mediaSrc(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.startsWith(MEDIA_PREFIX)) {
    return (
      "/api/media/" +
      v
        .slice(MEDIA_PREFIX.length)
        .split("/")
        .map(encodeURIComponent)
        .join("/")
    );
  }
  return v; // data URI legado (registros ainda não migrados)
}
