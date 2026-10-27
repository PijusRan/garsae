import { decodeMix, type MixState } from '../state/mix';
import { TILES } from '../tiles';

/** One small mark per tile that is on, coloured by category, so mixes can be told apart at a glance. */
export function Fingerprint({ encoded, mix }: { encoded?: string; mix?: MixState }) {
  const m = mix ?? (encoded ? decodeMix(encoded) : null);
  const on = m ? TILES.filter((t) => m.tiles[t.id].on) : [];
  return (
    <span className="fingerprint" aria-hidden="true">
      {on.map((t) => (
        <span key={t.id} className={`mark cat-${t.category}`} title={t.name} />
      ))}
    </span>
  );
}
