// Share links hold a compressed part in the URL hash: #part=<data>.
// The browser's own CompressionStream does the work, so this costs no library.

export const SHARE_PREFIX = '#part=';

type ByteStream = CompressionStream | DecompressionStream;

async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  stream: ByteStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Makes the hash part of a share link for a part. */
export async function encodePart(part: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(part));
  return SHARE_PREFIX + toBase64Url(await transform(json, new CompressionStream('deflate-raw')));
}

/** Reads a part from a share-link hash. Throws when the hash is not a valid share link. */
export async function decodePart(hash: string): Promise<unknown> {
  if (!hash.startsWith(SHARE_PREFIX)) throw new Error('This is not a share link for a part.');
  const bytes = fromBase64Url(hash.slice(SHARE_PREFIX.length));
  const json = await transform(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(json));
}
