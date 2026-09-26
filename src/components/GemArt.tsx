import { useState } from 'react';
import type { GemColor } from '../game/types';
import { gemArt } from './gameArt.generated';
import { gemShortNames } from '../i18n/zhCN';
import { publicAssetUrl } from './publicAssetUrl';

export default function GemArt({ color }: { color: GemColor }) {
  const src = gemArt[color];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return <span className="gem-art-fallback" aria-hidden="true">{gemShortNames[color]}</span>;
  }
  return <img className="gem-art" src={publicAssetUrl(src)} alt="" aria-hidden="true" onError={() => setFailedSrc(src)} />;
}
