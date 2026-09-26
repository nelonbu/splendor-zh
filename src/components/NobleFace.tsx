import type { NobleTile } from '../game/types';
import { COLORED_GEMS } from '../game/constants';
import AssetImage from './AssetImage';
import GemArt from './GemArt';
import { nobleArt } from './gameArt.generated';
import { pointsLabel, requirementAria } from '../i18n/zhCN';

export default function NobleFace({ noble }: { noble: NobleTile }) {
  const reqs = COLORED_GEMS.filter(color => (noble.requirement[color] ?? 0) > 0);
  return (
    <>
      <AssetImage src={nobleArt[noble.id]} className="noble-art" />
      <div className="points" aria-label={pointsLabel(noble.prestigePoints)}>{noble.prestigePoints}</div>
      <div className="requirement">
        {reqs.map(color => (
          <span key={color} className={`req-gem gem-${color}`} aria-label={requirementAria(color, noble.requirement[color] ?? 0)}>
            <GemArt color={color} />
            <span className="gem-value">{noble.requirement[color]}</span>
          </span>
        ))}
      </div>
    </>
  );
}
