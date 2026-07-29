interface TrackingWarningProps {
  message: string | null;
}

export function TrackingWarning({ message }: TrackingWarningProps) {
  if (!message) return null;
  return (
    <div className="tracking-warning" role="status">
      <span aria-hidden="true">!</span>
      {message}
    </div>
  );
}
