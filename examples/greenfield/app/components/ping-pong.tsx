export function PingPong() {
  return (
    <div className="pp-court" aria-hidden="true">
      <div className="pp-net" />
      <div className="pp-paddle pp-paddle-left" />
      <div className="pp-paddle pp-paddle-right" />
      <div className="pp-ball" />
    </div>
  );
}
