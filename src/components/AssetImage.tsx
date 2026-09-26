import { useState } from 'react';

/** Decorative art only. The numeric/text face remains visible if loading fails. */
export default function AssetImage({ src, className }: { src?: string; className: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return <img className={className} src={src} alt="" aria-hidden="true" onError={() => setFailedSrc(src)} />;
}
