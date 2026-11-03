import { getMountain } from '../data/mountains';
import { GameView } from './GameView';
import { isDesktop, supportsWebGL2 } from './webgl';

function Unsupported({ message }: { message: string }) {
  return (
    <div className="overlay overlay--error" role="alert">
      <p>{message}</p>
    </div>
  );
}

export function App() {
  if (!isDesktop()) {
    return (
      <Unsupported message="Mountain Odyssey is a desktop game. Please open it on a computer with a keyboard and mouse." />
    );
  }
  if (!supportsWebGL2()) {
    return (
      <Unsupported message="Mountain Odyssey needs WebGL2. Please use the latest Chrome, Edge, Firefox or Safari." />
    );
  }
  const id = new URLSearchParams(window.location.search).get('mountain') ?? 'mera-peak';
  const mountain = getMountain(id);
  if (!mountain) return <Unsupported message={`Unknown mountain "${id}".`} />;
  return <GameView mountain={mountain} />;
}
