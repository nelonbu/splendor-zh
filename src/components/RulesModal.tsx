import { copy } from '../i18n/zhCN';
import { COLORED_GEMS, TIER1_CARDS } from '../game/constants';
import CardFace from './CardFace';
import GemArt from './GemArt';

interface RulesModalProps {
  onClose: () => void;
}

const rules = copy.rules;

export default function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onClick={event => event.stopPropagation()}>
        <button className="rules-close" onClick={onClose} aria-label={copy.closeRules}>✕</button>
        <h2 id="rules-title" className="rules-title">{rules.title}</h2>

        <div className="rules-content">
          <section className="rules-section">
            <h3>{rules.objectiveTitle}</h3>
            <p>{rules.objective}</p>
          </section>
          <section className="rules-section">
            <h3>{rules.componentsTitle}</h3>
            <div className="rules-images">
              <div className="rules-image-block">
                <div className="rules-gem-examples" role="img" aria-label={rules.gemImage}>
                  {[...COLORED_GEMS, 'gold' as const].map(color => <span key={color} className={`rules-example-gem gem-${color}`}><GemArt color={color} /></span>)}
                </div>
                <span className="rules-img-caption">{rules.gemTokens}</span>
              </div>
              <div className="rules-image-block">
                <div className="rules-example-card card card-color-black" role="img" aria-label={rules.cardImage}><CardFace card={TIER1_CARDS[0]} /></div>
                <span className="rules-img-caption">{rules.developmentCards}</span>
              </div>
            </div>
            <ul>{rules.components.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="rules-section">
            <h3>{rules.actionsTitle}</h3>
            <ol>{rules.actions.map(item => <li key={item}>{item}</li>)}</ol>
          </section>
          <section className="rules-section">
            <h3>{rules.bonusesTitle}</h3>
            <p>{rules.bonuses}</p>
          </section>
          <section className="rules-section">
            <h3>{rules.noblesTitle}</h3>
            <p>{rules.nobles}</p>
          </section>
          <section className="rules-section">
            <h3>{rules.limitTitle}</h3>
            <p>{rules.limit}</p>
          </section>
          <section className="rules-section">
            <h3>{rules.endTitle}</h3>
            <p>{rules.end}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
