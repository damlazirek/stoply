// Stoply'nin maskotu: tombul otobüs.
// <BusCharacter mood="approaching" size={72} />
// mood: waiting | far | approaching | alert | arrived | passed | off
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { ASPECT, VIEWBOX, partsFor } from './busCharacterParts';

const ELEMENTS = { circle: Circle, ellipse: Ellipse, path: Path, rect: Rect };

export default function BusCharacter({ mood = 'far', size = 72, style }) {
  return (
    <Svg width={size} height={size * ASPECT} viewBox={VIEWBOX} style={style}>
      {partsFor(mood).map(({ t, ...props }, i) => {
        const El = ELEMENTS[t];
        return <El key={i} {...props} />;
      })}
    </Svg>
  );
}
